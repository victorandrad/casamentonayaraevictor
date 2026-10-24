// Gift orders: creation from the cart, the payment page (Stripe Checkout or Mercado Pago Checkout
// Pro, per config.gateway) and status sync.
import Stripe from 'stripe';
import type { ItemPedido, PedidoAdmin, PedidoCriado, PedidoInput, PedidoPublico, StatusPedido } from '@nv/shared/types';
import { precoComTaxa } from '@nv/shared/taxas';
import { config } from './config.ts';
import { query, queryOne, transaction } from './db.ts';
import { getTaxa, PRESENTE_SELECT, toPresente } from './repo.ts';
import { enviarRecibo } from './email.ts';
import * as mercadoPago from './mercadopago.ts';

export const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

// Whether gifts can be paid right now with the configured gateway.
export const pagamentoDisponivel = () => (config.gateway === 'mercadopago' ? mercadoPago.mercadoPagoConfigurado() : Boolean(stripe));

export class PedidoInvalido extends Error {}

// Short code people see for an order (receipt, panel): the start of its UUID, so it says nothing
// about how many orders exist.
export const numeroDoPedido = (uid: string) => uid.slice(0, 8).toUpperCase();

type PedidoRow = {
  id: number;
  uid: string;
  status: StatusPedido;
  nome: string;
  email: string;
  mensagem: string;
  total_centavos: number;
  subtotal_centavos: number | null;
  criado_em: Date;
  pago_em: Date | null;
  stripe_payment_intent: string | null;
  forma_pagamento: string | null;
  bandeira: string | null;
  taxa_centavos: number | null;
  liquido_centavos: number | null;
  recibo_enviado_em: Date | null;
  stripe_session_id: string | null;
  gateway: 'stripe' | 'mercadopago';
};

const PEDIDO_COLS = `id, uid, status, nome, email, mensagem, total_centavos, subtotal_centavos, criado_em, pago_em,
  stripe_payment_intent, forma_pagamento, bandeira, taxa_centavos, liquido_centavos, recibo_enviado_em, stripe_session_id, gateway`;

async function itensDoPedido(pedidoIds: number[]): Promise<Map<number, ItemPedido[]>> {
  const rows = await query<{ pedido_id: number; nome: string; quantidade: number; valor_centavos: number }>(
    'SELECT pedido_id, nome, quantidade, valor_centavos FROM pedido_itens WHERE pedido_id = ANY($1) ORDER BY id',
    [pedidoIds],
  );
  const porPedido = new Map<number, ItemPedido[]>();
  for (const r of rows) {
    const lista = porPedido.get(r.pedido_id) ?? [];
    lista.push({ nome: r.nome, quantidade: r.quantidade, valorCentavos: r.valor_centavos });
    porPedido.set(r.pedido_id, lista);
  }
  return porPedido;
}

// Prices always come from the database, never from the browser.
export async function criarPedido(input: PedidoInput): Promise<PedidoCriado> {
  if (!pagamentoDisponivel()) throw new Error('Pagamento não configurado');
  const gateway = config.gateway;

  // Gifts come by their public UUID; the sequential id is only used inside this transaction.
  const quantidades = new Map<string, number>();
  for (const item of input.itens) quantidades.set(item.presenteId, (quantidades.get(item.presenteId) ?? 0) + item.quantidade);

  const ids = [...quantidades.keys()];
  const taxa = await getTaxa();
  const { nome, email, mensagem } = input.convidado;

  // Everything below runs in one transaction with the gift rows locked, so two
  // guests can't both take the last unit of a unique gift.
  const { pedidoId, pedidoUid, itens } = await transaction(async (client) => {
    await client.query('SELECT id FROM presentes WHERE uid = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
    const { rows } = await client.query<Parameters<typeof toPresente>[0]>(`${PRESENTE_SELECT} WHERE p.uid = ANY($1::uuid[])`, [ids]);
    const presentes = rows.map(toPresente);
    const idInterno = new Map(rows.map((r) => [r.uid, r.id]));
    if (presentes.length !== quantidades.size) {
      throw new PedidoInvalido('Algum presente do carrinho não está mais na lista. Atualize a página e tente de novo.');
    }
    for (const p of presentes) {
      const pedida = quantidades.get(p.id)!;
      if (p.disponivel !== null && pedida > p.disponivel) {
        throw new PedidoInvalido(
          p.disponivel === 0
            ? `"${p.nome}" acabou de ser presenteado por outra pessoa. Remova do carrinho e escolha outro presente.`
            : `Restam só ${p.disponivel} unidade(s) de "${p.nome}". Ajuste a quantidade no carrinho.`,
        );
      }
    }

    // Gift values are what the couple receives; each product is charged with the
    // fee on top, computed here with the same rule the site uses to show prices.
    const itens = presentes.map((p) => ({
      id: idInterno.get(p.id)!,
      uid: p.id,
      nome: p.nome,
      valor_centavos: p.valorCentavos,
      quantidade: Math.min(10, quantidades.get(p.id)!),
      preco_centavos: precoComTaxa(p.valorCentavos, taxa),
    }));
    const subtotal = itens.reduce((soma, i) => soma + i.valor_centavos * i.quantidade, 0);
    const total = itens.reduce((soma, i) => soma + i.preco_centavos * i.quantidade, 0);
    if (itens.some((i) => i.valor_centavos <= 0) || subtotal < 100) {
      throw new PedidoInvalido('O valor mínimo para presentear é R$ 1,00.');
    }

    const inserido = await client.query<{ id: number; uid: string }>(
      `INSERT INTO pedidos (nome, email, mensagem, total_centavos, subtotal_centavos, gateway)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, uid`,
      [nome, email, mensagem, total, subtotal, gateway],
    );
    const { id, uid } = inserido.rows[0]!;
    for (const i of itens) {
      await client.query(
        'INSERT INTO pedido_itens (pedido_id, presente_id, nome, valor_centavos, quantidade) VALUES ($1, $2, $3, $4, $5)',
        [id, i.id, i.nome, i.preco_centavos, i.quantidade],
      );
    }
    return { pedidoId: id, pedidoUid: uid, itens };
  });

  if (gateway === 'mercadopago') {
    let preferencia: { id: string; url: string };
    try {
      preferencia = await mercadoPago.criarPreferencia({
        uid: pedidoUid,
        nome,
        email,
        itens: itens.map((i) => ({ uid: i.uid, nome: i.nome, quantidade: i.quantidade, precoCentavos: i.preco_centavos })),
      });
    } catch (error) {
      await query('DELETE FROM pedidos WHERE id = $1', [pedidoId]);
      throw error;
    }
    await query('UPDATE pedidos SET mp_preferencia_id = $2 WHERE id = $1', [pedidoId, preferencia.id]);
    return { url: preferencia.url, pedido: pedidoUid };
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    locale: 'pt-BR',
    customer_email: email,
    client_reference_id: pedidoUid,
    metadata: { pedido: pedidoUid },
    line_items: itens.map((i) => ({
      quantity: i.quantidade,
      price_data: { currency: 'brl', unit_amount: i.preco_centavos, product_data: { name: i.nome } },
    })),
    // Short session so a reserved unique gift is released soon if the guest gives up
    // (30 minutes is Stripe's minimum).
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    // The guest comes back with our order's UUID (not Stripe's session id): it's the only order
    // identifier the browser ever sees or keeps.
    success_url: `${config.siteUrl}/?pedido=${pedidoUid}#presentes`,
    cancel_url: `${config.siteUrl}/?pedido=cancelado#presentes`,
  };

  if (!stripe) throw new Error('Stripe não configurado');
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(params);
  } catch (error) {
    // Don't leave an order behind that can never be paid.
    await query('DELETE FROM pedidos WHERE id = $1', [pedidoId]);
    throw error;
  }

  await query('UPDATE pedidos SET stripe_session_id = $2 WHERE id = $1', [pedidoId, session.id]);
  if (!session.url) throw new Error('Stripe não retornou a URL do Checkout');
  return { url: session.url, pedido: pedidoUid };
}

// Maps a Checkout Session to our status. A paid order never goes back.
function statusDaSessao(session: Stripe.Checkout.Session, tipoEvento?: string): StatusPedido | null {
  if (tipoEvento === 'checkout.session.async_payment_failed') return 'falhou';
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') return 'pago';
  if (session.status === 'expired') return 'expirado';
  if (session.status === 'complete') return 'aguardando'; // async methods (e.g. Pix/boleto) still settling
  return null;
}

export async function sincronizarSessao(session: Stripe.Checkout.Session, tipoEvento?: string) {
  const status = statusDaSessao(session, tipoEvento);
  if (!status) return;
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const atualizado = await queryOne<{ id: number }>(
    `UPDATE pedidos
        SET status = $2,
            stripe_payment_intent = coalesce($3, stripe_payment_intent),
            pago_em = CASE WHEN $2 = 'pago' THEN coalesce(pago_em, now()) ELSE pago_em END
      WHERE stripe_session_id = $1 AND status <> 'pago'
      RETURNING id`,
    [session.id, status, paymentIntent ?? null],
  );
  if (atualizado && status === 'pago' && paymentIntent) {
    const pedidoId = atualizado.id;
    const temTaxa = await registrarTaxa(pedidoId, paymentIntent);
    // Receipt goes out in the background so the webhook answers Stripe quickly.
    void enviarReciboDoPedido(pedidoId);
    if (!temTaxa) {
      // Pix settles its balance transaction a few seconds after the payment;
      // try again shortly (listing the orders also fills any that are left).
      for (const atraso of [15_000, 90_000]) {
        setTimeout(() => void registrarTaxa(pedidoId, paymentIntent), atraso).unref();
      }
    }
  }
}

// Stores the payment method and the fee Stripe actually charged (from the
// charge's balance transaction), so card, Pix etc. each get their real rate.
// Best effort: returns false while Stripe hasn't settled the fee yet.
async function registrarTaxa(pedidoId: number, paymentIntentId: string): Promise<boolean> {
  if (!stripe) return false;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction', 'payment_method'],
    });
    const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const metodo = typeof pi.payment_method === 'object' ? pi.payment_method : null;
    const bt = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
    // Fees are only meaningful here when settled in reais.
    const temTaxa = bt !== null && bt.currency === 'brl';
    await query(
      `UPDATE pedidos
          SET forma_pagamento = coalesce($2, forma_pagamento),
              bandeira = coalesce($3, bandeira),
              taxa_centavos = coalesce($4, taxa_centavos),
              liquido_centavos = coalesce($5, liquido_centavos)
        WHERE id = $1`,
      [
        pedidoId,
        metodo?.type ?? charge?.payment_method_details?.type ?? null,
        metodo?.card?.brand ?? null,
        temTaxa ? bt.fee : null,
        temTaxa ? bt.net : null,
      ],
    );
    return temTaxa;
  } catch (error) {
    console.warn(`não foi possível obter a taxa do pedido ${pedidoId}:`, (error as Error).message);
    return false;
  }
}

// Returns false when the event was already handled (Stripe may deliver it twice).
export async function registrarEvento(id: string, tipo: string): Promise<boolean> {
  const row = await queryOne('INSERT INTO stripe_eventos (id, tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id', [id, tipo]);
  return row !== null;
}

// Used by the thank-you screen. The order's UUID is unguessable, so it works as the guest's
// access token. If the webhook hasn't arrived yet, ask Stripe.
export async function pedidoPorUid(uid: string): Promise<PedidoPublico | null> {
  const buscar = () => queryOne<PedidoRow>(`SELECT ${PEDIDO_COLS} FROM pedidos WHERE uid = $1`, [uid]);
  let pedido = await buscar();
  if (!pedido) return null;
  const emAberto = pedido.status === 'pendente' || pedido.status === 'aguardando';
  if (pedido.gateway === 'mercadopago' && emAberto && mercadoPago.mercadoPagoConfigurado()) {
    try {
      const pagamento = await mercadoPago.ultimoPagamentoDoPedido(uid);
      if (pagamento) await aplicarPagamentoMercadoPago(pagamento);
      pedido = (await buscar())!;
    } catch {
      // keep the stored status if Mercado Pago can't be reached
    }
  }
  if (pedido.gateway === 'stripe' && stripe && pedido.stripe_session_id && emAberto) {
    try {
      await sincronizarSessao(await stripe.checkout.sessions.retrieve(pedido.stripe_session_id));
      pedido = (await buscar())!;
    } catch {
      // keep the stored status if Stripe can't be reached
    }
  }
  const itens = (await itensDoPedido([pedido.id])).get(pedido.id) ?? [];
  return {
    status: pedido.status,
    nome: pedido.nome,
    subtotalCentavos: pedido.subtotal_centavos ?? pedido.total_centavos,
    totalCentavos: pedido.total_centavos,
    itens,
  };
}

const listar = () =>
  query<PedidoRow>(
    `SELECT ${PEDIDO_COLS}
       FROM pedidos WHERE status <> 'pendente' OR criado_em > now() - interval '1 day'
      ORDER BY coalesce(pago_em, criado_em) DESC`,
  );

export async function listarPedidos(): Promise<PedidoAdmin[]> {
  let pedidos = await listar();
  // Fill in fees Stripe hadn't settled when the webhook arrived (a few per request).
  const semTaxa = pedidos.filter((p) => p.status === 'pago' && p.taxa_centavos === null && p.stripe_payment_intent).slice(0, 10);
  if (semTaxa.length) {
    await Promise.all(semTaxa.map((p) => registrarTaxa(p.id, p.stripe_payment_intent!)));
    pedidos = await listar();
  }
  const itens = await itensDoPedido(pedidos.map((p) => p.id));
  return pedidos.map((p) => ({
    id: p.uid,
    gateway: p.gateway,
    numero: numeroDoPedido(p.uid),
    status: p.status,
    nome: p.nome,
    email: p.email,
    mensagem: p.mensagem,
    subtotalCentavos: p.subtotal_centavos ?? p.total_centavos,
    totalCentavos: p.total_centavos,
    criadoEm: p.criado_em.toISOString(),
    pagoEm: p.pago_em?.toISOString() ?? null,
    itens: itens.get(p.id) ?? [],
    formaPagamento: p.forma_pagamento,
    bandeira: p.bandeira,
    taxaCentavos: p.taxa_centavos,
    liquidoCentavos: p.liquido_centavos,
    reciboEnviadoEm: p.recibo_enviado_em?.toISOString() ?? null,
  }));
}

// Sends the guest's receipt e-mail once. The row is claimed first (so a webhook
// delivered twice can't send two e-mails) and released again if sending fails.
// `reenviar` lets the couple send it again from the panel.
// `pedido` is the internal id (webhook) or the public UUID (panel's "Reenviar recibo").
export async function enviarReciboDoPedido(pedido: number | string, { reenviar = false } = {}): Promise<boolean> {
  const coluna = typeof pedido === 'string' ? 'uid' : 'id';
  const linha = await queryOne<PedidoRow>(
    `UPDATE pedidos SET recibo_enviado_em = now()
      WHERE ${coluna} = $1 AND status = 'pago' ${reenviar ? '' : 'AND recibo_enviado_em IS NULL'}
      RETURNING ${PEDIDO_COLS}`,
    [pedido],
  );
  return linha ? entregarRecibo(linha) : false;
}

async function entregarRecibo(pedido: PedidoRow): Promise<boolean> {
  const pedidoId = pedido.id;
  try {
    const itens = (await itensDoPedido([pedido.id])).get(pedido.id) ?? [];
    await enviarRecibo({
      numero: numeroDoPedido(pedido.uid),
      nome: pedido.nome,
      email: pedido.email,
      mensagem: pedido.mensagem,
      itens,
      totalCentavos: pedido.total_centavos,
      formaPagamento: pedido.forma_pagamento,
      pagoEm: pedido.pago_em ?? new Date(),
    });
    console.info(`recibo do pedido ${pedido.uid} enviado para ${pedido.email}`);
    return true;
  } catch (error) {
    await query('UPDATE pedidos SET recibo_enviado_em = NULL WHERE id = $1', [pedidoId]);
    console.warn(`falha ao enviar o recibo do pedido ${pedido.uid}:`, (error as Error).message);
    return false;
  }
}

// Guest came back from Stripe without paying: expire the session so the gifts it
// reserved are free again right away (instead of waiting for it to time out).
export async function cancelarPedidoPendente(uid: string): Promise<void> {
  const preferencia = await mercadoPago.preferenciaDoPedido(uid);
  if (preferencia) {
    // Close the Mercado Pago page first, then bring in a payment that may already exist (a Pix
    // paid just before the guest pressed back), and only then free the gifts. If Mercado Pago
    // can't be reached, the order stays as it is and its reservation runs out on its own.
    try {
      await mercadoPago.expirarPreferencia(preferencia);
      const pagamento = await mercadoPago.ultimoPagamentoDoPedido(uid);
      if (pagamento) await aplicarPagamentoMercadoPago(pagamento);
    } catch {
      return;
    }
    await mercadoPago.marcarExpirado(uid);
    return;
  }
  const pedido = await queryOne<{ stripe_session_id: string | null }>(
    "SELECT stripe_session_id FROM pedidos WHERE uid = $1 AND status = 'pendente'",
    [uid],
  );
  if (!pedido?.stripe_session_id || !stripe) return;
  const sessionId = pedido.stripe_session_id;
  try {
    await sincronizarSessao(await stripe.checkout.sessions.expire(sessionId));
  } catch {
    // Already completed or expired on Stripe's side: just sync what it says.
    await sincronizarSessao(await stripe.checkout.sessions.retrieve(sessionId)).catch(() => {});
  }
}

// A Mercado Pago payment (from the webhook or the return page) brought into its order; the receipt
// goes out in the background once it is paid.
export async function aplicarPagamentoMercadoPago(pagamento: Parameters<typeof mercadoPago.sincronizarPagamento>[0]) {
  const pagoAgora = await mercadoPago.sincronizarPagamento(pagamento);
  if (pagoAgora) void enviarReciboDoPedido(pagoAgora);
}
