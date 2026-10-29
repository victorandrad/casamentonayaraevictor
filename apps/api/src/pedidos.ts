// Gift orders: creation from the cart, the Mercado Pago payment page (Checkout Pro) and status sync.
import type { ItemPedido, PedidoAdmin, PedidoCriado, PedidoInput, PedidoPublico, StatusPedido } from '@nv/shared/types';
import { precoComTaxa } from '@nv/shared/taxas';
import { query, queryOne, transaction } from './db.ts';
import { getTaxa, PRESENTE_SELECT, toPresente } from './repo.ts';
import { enviarRecibo } from './email.ts';
import * as mercadoPago from './mercadopago.ts';
import { tokenDeAcesso } from './mercadopagoConta.ts';

// Whether gifts can be paid right now: a Mercado Pago account is connected in the panel.
export const pagamentoDisponivel = async () => (await tokenDeAcesso()) !== null;

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
};

// Orders paid through Stripe (before Mercado Pago) keep their Stripe columns; nothing reads them now.
const PEDIDO_COLS = `id, uid, status, nome, email, mensagem, total_centavos, subtotal_centavos, criado_em, pago_em,
  forma_pagamento, bandeira, taxa_centavos, liquido_centavos, recibo_enviado_em, gateway`;

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
    return { pedidoId: id, pedidoUid: uid, itens };
  });

  let preferencia: { id: string; url: string };
  try {
    preferencia = await mercadoPago.criarPreferencia({
      uid: pedidoUid,
      nome,
      email,
      itens: itens.map((i) => ({ uid: i.uid, nome: i.nome, quantidade: i.quantidade, precoCentavos: i.preco_centavos })),
    });
  } catch (error) {
    // Don't leave an order behind that can never be paid.
    await query('DELETE FROM pedidos WHERE id = $1', [pedidoId]);
    throw error;
  }
  await query('UPDATE pedidos SET mp_preferencia_id = $2 WHERE id = $1', [pedidoId, preferencia.id]);
  return { url: preferencia.url, pedido: pedidoUid };
}

// A Mercado Pago payment (from the webhook or the return page) brought into its order; the receipt
// goes out in the background once it is paid.
export async function aplicarPagamentoMercadoPago(pagamento: Parameters<typeof mercadoPago.sincronizarPagamento>[0]) {
  const pagoAgora = await mercadoPago.sincronizarPagamento(pagamento);
  if (pagoAgora) void enviarReciboDoPedido(pagoAgora);
}

// Used by the thank-you screen. The order's UUID is unguessable, so it works as the guest's
// access token. If the webhook hasn't arrived yet, ask Mercado Pago.
export async function pedidoPorUid(uid: string): Promise<PedidoPublico | null> {
  const buscar = () => queryOne<PedidoRow>(`SELECT ${PEDIDO_COLS} FROM pedidos WHERE uid = $1`, [uid]);
  let pedido = await buscar();
  if (!pedido) return null;
  const emAberto = pedido.status === 'pendente' || pedido.status === 'aguardando';
  if (pedido.gateway === 'mercadopago' && emAberto) {
    try {
      const pagamento = await mercadoPago.ultimoPagamentoDoPedido(uid);
      if (pagamento) await aplicarPagamentoMercadoPago(pagamento);
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

// Guest came back without paying: close the Mercado Pago page first, then bring in a payment that
// may already exist (a Pix paid just before the guest pressed back), and only then free the gifts.
// If Mercado Pago can't be reached, the order stays as it is and its reservation runs out on its own.
export async function cancelarPedidoPendente(uid: string): Promise<void> {
  const preferencia = await mercadoPago.preferenciaDoPedido(uid);
  if (!preferencia) return;
  try {
    await mercadoPago.expirarPreferencia(preferencia);
    const pagamento = await mercadoPago.ultimoPagamentoDoPedido(uid);
    if (pagamento) await aplicarPagamentoMercadoPago(pagamento);
  } catch {
    return;
  }
  await mercadoPago.marcarExpirado(uid);
}
