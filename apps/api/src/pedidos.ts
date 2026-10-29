// Gift orders: created from the cart and paid inside the site (Mercado Pago Checkout Transparente),
// then kept in sync with the payment.
import type { ItemPedido, PagamentoResultado, PedidoAdmin, PedidoInput, PedidoPublico, StatusPedido } from '@nv/shared/types';
import { precoComTaxa } from '@nv/shared/taxas';
import { query, queryOne, transaction } from './db.ts';
import { getTaxa, PRESENTE_SELECT, toPresente } from './repo.ts';
import { enviarPix, enviarRecibo } from './email.ts';
import * as mercadoPago from './mercadopago.ts';
import { chavePublica } from './mercadopagoConta.ts';

// Whether gifts can be paid right now: a Mercado Pago account is connected in the panel (with the
// public key the payment form needs).
export const pagamentoDisponivel = async () => (await chavePublica()) !== null;

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
  forma_pagamento: string | null;
  bandeira: string | null;
  taxa_centavos: number | null;
  liquido_centavos: number | null;
  recibo_enviado_em: Date | null;
  gateway: 'stripe' | 'mercadopago';
  pix_codigo: string | null;
  pix_qr: string | null;
  pix_expira_em: Date | null;
};

// Orders paid through Stripe (before Mercado Pago) keep their Stripe columns; nothing reads them now.
const PEDIDO_COLS = `id, uid, status, nome, email, mensagem, total_centavos, subtotal_centavos, criado_em, pago_em,
  forma_pagamento, bandeira, taxa_centavos, liquido_centavos, recibo_enviado_em, gateway, pix_codigo, pix_qr, pix_expira_em`;

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

// Card refusals in words for the guest (Mercado Pago's status_detail). Anything else gets the generic one.
const MOTIVOS: Record<string, string> = {
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
  cc_rejected_bad_filled_date: 'Confira a validade do cartão.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança do cartão.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente. Tente outro cartão ou o Pix.',
  cc_rejected_call_for_authorize: 'O banco pediu para você autorizar este pagamento. Fale com o banco e tente de novo.',
  cc_rejected_card_disabled: 'O cartão está bloqueado ou não foi ativado. Fale com o banco ou use outro cartão.',
  cc_rejected_duplicated_payment: 'Já existe um pagamento igual a este. Confira seu e-mail antes de tentar de novo.',
  cc_rejected_high_risk: 'O pagamento foi recusado por segurança. Tente outro cartão ou o Pix.',
  cc_rejected_max_attempts: 'Muitas tentativas com este cartão. Use outro cartão ou o Pix.',
  cc_rejected_invalid_installments: 'O cartão não aceita esse número de parcelas. Escolha outro.',
  cc_rejected_blacklist: 'O cartão foi recusado. Use outro cartão ou o Pix.',
};
export const MOTIVO_PADRAO = 'O pagamento foi recusado e nada foi cobrado. Tente outro cartão ou o Pix.';
const PIX_ABERTOS_POR_EMAIL = 2;
const PIX_UNICOS_POR_PEDIDO = 5;
const PIX_UNICOS_ABERTOS_NO_SITE = 8;

// Creates the order and pays it in one go: the order exists only from the moment the guest presses
// "Pagar". Prices always come from the database, never from the browser.
export async function pagar(input: PedidoInput): Promise<PagamentoResultado> {
  const pix = input.pagamento.metodo === 'pix';
  // A Pix holds its gifts for 30 minutes: one guest (e-mail) can't keep many of them open at once.
  if (pix) {
    const abertos = await queryOne<{ n: string }>(
      `SELECT count(*) AS n FROM pedidos
        WHERE lower(email) = lower($1) AND status = 'aguardando' AND pix_expira_em > now()`,
      [input.convidado.email],
    );
    if (Number(abertos?.n ?? 0) >= PIX_ABERTOS_POR_EMAIL) {
      throw new PedidoInvalido('Você já tem Pix esperando pagamento. Pague ou espere eles vencerem antes de gerar outro.');
    }
  }
  // Gifts come by their public UUID; the sequential id is only used inside this transaction.
  const quantidades = new Map<string, number>();
  for (const item of input.itens) quantidades.set(item.presenteId, (quantidades.get(item.presenteId) ?? 0) + item.quantidade);

  const ids = [...quantidades.keys()];
  const taxa = await getTaxa();
  const { nome, email, mensagem } = input.convidado;

  // Everything below runs in one transaction with the gift rows locked, so two
  // guests can't both take the last unit of a unique gift.
  const { pedidoId, pedidoUid, itens, total } = await transaction(async (client) => {
    await client.query('SELECT id FROM presentes WHERE uid = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
    const { rows } = await client.query<Parameters<typeof toPresente>[0]>(`${PRESENTE_SELECT} WHERE p.uid = ANY($1::uuid[])`, [ids]);
    const presentes = rows.map(toPresente);
    const idInterno = new Map(rows.map((r) => [r.uid, r.id]));
    if (presentes.length !== quantidades.size) {
      throw new PedidoInvalido('Algum presente do carrinho não está mais na lista. Atualize a página e tente de novo.');
    }
    for (const p of presentes) {
      const pedida = quantidades.get(p.id)!;
      if (p.disponivel === null) continue;
      if (pedida > p.disponivel) {
        throw new PedidoInvalido(
          p.disponivel === 0
            ? `"${p.nome}" acabou de ser presenteado por outra pessoa. Remova do carrinho e escolha outro presente.`
            : `Restam só ${p.disponivel} unidade(s) de "${p.nome}". Ajuste a quantidade no carrinho.`,
        );
      }
      // Someone else is paying for it right now: two guests can't pay for the same unit.
      const livre = Math.max(0, p.disponivel - p.emPagamento);
      if (pedida > livre) {
        throw new PedidoInvalido(
          livre === 0
            ? `Outra pessoa está pagando "${p.nome}" neste momento. Se ela não concluir, você pode presentear daqui a alguns minutos: tente de novo mais tarde ou escolha outro presente.`
            : `Outra pessoa está pagando parte de "${p.nome}" neste momento: dá para presentear ${livre} agora. Ajuste a quantidade no carrinho.`,
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
    if (total !== input.totalEsperadoCentavos) {
      throw new PedidoInvalido('Os valores dos presentes mudaram. Atualize a página para ver os valores novos.');
    }
    // A Pix holds unique gifts for 30 minutes: a single one can't lock a large part of the list.
    const unicos = presentes.filter((p) => p.quantidadeMaxima === 1).length;
    if (pix && unicos > PIX_UNICOS_POR_PEDIDO) {
      throw new PedidoInvalido(`Com Pix, dá para presentear até ${PIX_UNICOS_POR_PEDIDO} presentes únicos por vez. Pague com cartão ou divida em mais de um Pix.`);
    }
    // And across the site: someone generating Pix after Pix with new e-mails and IPs still can't
    // hold more than a slice of the unique gifts (cards keep working meanwhile).
    if (pix && unicos > 0) {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(DISTINCT pe.id) AS n FROM pedidos pe
           JOIN pedido_itens i ON i.pedido_id = pe.id JOIN presentes p ON p.id = i.presente_id
          WHERE pe.status = 'aguardando' AND pe.pix_expira_em > now() AND p.quantidade_maxima = 1`,
      );
      if (Number(rows[0]?.n ?? 0) >= PIX_UNICOS_ABERTOS_NO_SITE) {
        throw new PedidoInvalido('Muitos Pix esperando pagamento agora. Pague com cartão ou tente o Pix de novo em alguns minutos.');
      }
    }
    if (itens.some((i) => i.valor_centavos <= 0) || subtotal < 100) {
      throw new PedidoInvalido('O valor mínimo para presentear é R$ 1,00.');
    }

    const inserido = await client.query<{ id: number; uid: string }>(
      `INSERT INTO pedidos (nome, email, mensagem, total_centavos, subtotal_centavos)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, uid`,
      [nome, email, mensagem, total, subtotal],
    );
    const { id, uid } = inserido.rows[0]!;
    for (const i of itens) {
      await client.query(
        'INSERT INTO pedido_itens (pedido_id, presente_id, nome, valor_centavos, quantidade) VALUES ($1, $2, $3, $4, $5)',
        [id, i.id, i.nome, i.preco_centavos, i.quantidade],
      );
    }
    return { pedidoId: id, pedidoUid: uid, itens, total };
  });

  let pagamento: mercadoPago.Pagamento;
  try {
    pagamento = await mercadoPago.criarPagamento({
      uid: pedidoUid,
      totalCentavos: total,
      itens: itens.map((i) => ({ uid: i.uid, nome: i.nome, quantidade: i.quantidade, precoCentavos: i.preco_centavos })),
      pagador: { nome, email, cpf: input.convidado.cpf },
      dados: input.pagamento,
      dispositivo: input.dispositivo,
    });
  } catch (error) {
    // Mercado Pago refused the request itself (e.g. an expired card token): nothing was charged, so
    // the order goes.
    if (error instanceof mercadoPago.PagamentoRecusadoPeloMercadoPago || error instanceof mercadoPago.ContaNaoConectada) {
      await query('DELETE FROM pedidos WHERE id = $1', [pedidoId]);
      throw error;
    }
    // A timeout or 5xx is different: the payment may exist. The order stays "pendente" and the guest
    // gets its id to follow it (the order page asks Mercado Pago); conciliarPendentes settles it if
    // nobody does.
    console.error(`pagamento do pedido ${pedidoUid} sem resposta clara do Mercado Pago:`, (error as Error).message);
    return { pedido: pedidoUid, status: 'pendente' };
  }
  try {
    await aplicarPagamentoMercadoPago(pagamento);
  } catch (error) {
    // Charged, but the database failed to record it: never tell the guest to pay again. The order is
    // followed as "pendente" and conciliarPendentes records the payment.
    console.error(`pagamento ${pagamento.id} do pedido ${pedidoUid} não foi registrado:`, (error as Error).message);
    return { pedido: pedidoUid, status: 'pendente' };
  }
  const status = (await queryOne<{ status: StatusPedido }>('SELECT status FROM pedidos WHERE id = $1', [pedidoId]))!.status;
  // A Pix waiting: its code also goes by e-mail, in the background (the guest sees it on screen already).
  const qr = pagamento.point_of_interaction?.transaction_data;
  if (status === 'aguardando' && qr?.qr_code) {
    enviarPix({
      numero: numeroDoPedido(pedidoUid),
      nome,
      email,
      itens: itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, valorCentavos: i.preco_centavos })),
      totalCentavos: total,
      codigo: qr.qr_code,
      qrBase64: qr.qr_code_base64 ?? null,
      expiraEm: pagamento.date_of_expiration ? new Date(pagamento.date_of_expiration) : null,
    })
      .then(() => console.info(`Pix do pedido ${pedidoUid} enviado para ${email}`))
      .catch((error) => console.warn(`falha ao enviar o Pix do pedido ${pedidoUid}:`, (error as Error).message));
  }
  return {
    pedido: pedidoUid,
    status,
    ...(status === 'falhou' ? { motivo: MOTIVOS[pagamento.status_detail ?? ''] ?? MOTIVO_PADRAO } : {}),
  };
}

// A Mercado Pago payment (from the webhook or the return page) brought into its order; the receipt
// goes out in the background once it is paid.
export async function aplicarPagamentoMercadoPago(pagamento: Parameters<typeof mercadoPago.sincronizarPagamento>[0]) {
  const pagoAgora = await mercadoPago.sincronizarPagamento(pagamento);
  if (pagoAgora) void enviarReciboDoPedido(pagoAgora);
}

// Used by the thank-you screen. The order's UUID is unguessable, so it works as the guest's
// access token. If the webhook hasn't arrived yet, ask Mercado Pago.
// Brings an order up to date with Mercado Pago. A Pix past its deadline that Mercado Pago still shows
// as waiting is cancelled there first: the gift goes back on the list at that time, so the QR Code
// (on screen or in the e-mail) must stop working too. Returns whether Mercado Pago has a payment.
async function atualizarComMercadoPago(uid: string, pixVencido: boolean): Promise<boolean> {
  let pagamento = await mercadoPago.ultimoPagamentoDoPedido(uid);
  if (pagamento && pixVencido && pagamento.status === 'pending' && pagamento.payment_method_id === 'pix') {
    try {
      pagamento = await mercadoPago.cancelarPagamento(String(pagamento.id));
      console.info(`Pix vencido do pedido ${uid} cancelado no Mercado Pago`);
    } catch {
      // Paid at the last second, or already closed: take what Mercado Pago says now.
      pagamento = await mercadoPago.buscarPagamento(String(pagamento.id));
    }
  }
  if (pagamento) await aplicarPagamentoMercadoPago(pagamento);
  return pagamento !== null;
}

const pixVencido = (p: { status: StatusPedido; pix_expira_em: Date | null }) =>
  p.status === 'aguardando' && p.pix_expira_em !== null && p.pix_expira_em.getTime() < Date.now();

export async function pedidoPorUid(uid: string): Promise<PedidoPublico | null> {
  const buscar = () => queryOne<PedidoRow>(`SELECT ${PEDIDO_COLS} FROM pedidos WHERE uid = $1`, [uid]);
  let pedido = await buscar();
  if (!pedido) return null;
  const emAberto = pedido.status === 'pendente' || pedido.status === 'aguardando';
  if (pedido.gateway === 'mercadopago' && emAberto) {
    try {
      await atualizarComMercadoPago(uid, pixVencido(pedido));
      pedido = (await buscar())!;
    } catch {
      // keep the stored status if Mercado Pago can't be reached
    }
  }
  const itens = (await itensDoPedido([pedido.id])).get(pedido.id) ?? [];
  return {
    status: pedido.status,
    nome: pedido.nome,
    subtotalCentavos: pedido.subtotal_centavos ?? pedido.total_centavos,
    totalCentavos: pedido.total_centavos,
    itens,
    pix:
      pedido.status === 'aguardando' && pedido.pix_codigo
        ? { codigo: pedido.pix_codigo, qrBase64: pedido.pix_qr, expiraEm: pedido.pix_expira_em?.toISOString() ?? null }
        : null,
  };
}

const listar = () =>
  query<PedidoRow>(
    `SELECT ${PEDIDO_COLS}
       FROM pedidos WHERE status <> 'pendente' OR criado_em > now() - interval '1 day'
      ORDER BY coalesce(pago_em, criado_em) DESC`,
  );

export async function listarPedidos(): Promise<PedidoAdmin[]> {
  const pedidos = await listar();
  const itens = await itensDoPedido(pedidos.map((p) => p.id));
  return pedidos.map((p) => ({
    id: p.uid,
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

// Orders whose outcome may have been missed: "pendente" ones (Mercado Pago didn't answer clearly when
// paying) and Pix still "aguardando" after expiring (the paid or expired notice may have been lost;
// one Mercado Pago still shows as waiting is cancelled there, see atualizarComMercadoPago).
// Ask Mercado Pago what happened. A "pendente" with no payment after a while had none, and is closed.
// Runs from server.ts every few minutes.
export async function conciliarPendentes(): Promise<void> {
  const pendentes = await query<{ uid: string; antigo: boolean; pix_vencido: boolean }>(
    `SELECT uid, status = 'pendente' AND criado_em < now() - interval '15 minutes' AS antigo,
            status = 'aguardando' AND pix_expira_em < now() AS pix_vencido
       FROM pedidos
      WHERE gateway = 'mercadopago' AND criado_em > now() - interval '2 days'
        AND ((status = 'pendente' AND mp_preferencia_id IS NULL AND criado_em < now() - interval '1 minute')
          OR (status = 'aguardando' AND coalesce(pix_expira_em, criado_em + interval '90 minutes') < now()))
      ORDER BY criado_em
      LIMIT 20`,
  );
  for (const { uid, antigo, pix_vencido } of pendentes) {
    try {
      const temPagamento = await atualizarComMercadoPago(uid, pix_vencido);
      if (!temPagamento && antigo) await query("UPDATE pedidos SET status = 'expirado' WHERE uid = $1 AND status = 'pendente'", [uid]);
    } catch (error) {
      console.warn(`não foi possível conciliar o pedido ${uid}:`, (error as Error).message);
    }
  }
}
