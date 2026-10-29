// Mercado Pago Checkout Transparente: the guest pays inside the site. The Payment Brick (Mercado
// Pago's own form, in an iframe) turns the card into a one-time token; this module creates the
// payment with it (or a Pix) in the account the couple connected (mercadopagoConta.ts). Card data
// never reaches the site. The webhook and the order page bring later changes back (Pix paid, refund).
import type { ErroMercadoPago, StatusPedido } from '@nv/shared/types';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';
import { tokenDeAcesso } from './mercadopagoConta.ts';

const API = 'https://api.mercadopago.com';
// A Pix must be paid within this time (Mercado Pago's minimum); past it the order is freed.
export const PIX_MINUTOS = 30;
// Card installments. Interest, if any, follows the account's own settings on Mercado Pago (by
// default the guest pays it; "parcelamento sem juros" is set up there).
export const PARCELAS = 12;

export class ContaNaoConectada extends Error {}

// The last error Mercado Pago answered with, shown to the couple in the panel to diagnose a setup
// problem (e.g. an Access Token Mercado Pago refuses). In memory only; never shown to guests.
let ultimoErro: ErroMercadoPago | null = null;
export const ultimoErroMercadoPago = () => ultimoErro;
// Mercado Pago answered with an error (4xx): the request itself was refused (e.g. invalid card token).
export class PagamentoRecusadoPeloMercadoPago extends Error {}

async function mp<T>(
  caminho: string,
  init: { method?: string; body?: unknown; idempotencia?: string; dispositivo?: string } = {},
): Promise<T> {
  const token = await tokenDeAcesso();
  if (!token) {
    ultimoErro = { quando: new Date().toISOString(), status: null, caminho, codigo: null, mensagem: 'Sem Access Token utilizável (conta não conectada ou token ilegível).' };
    throw new ContaNaoConectada('Nenhuma conta do Mercado Pago conectada.');
  }
  const resposta = await fetch(`${API}${caminho}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.idempotencia ? { 'X-Idempotency-Key': init.idempotencia } : {}),
      // Device fingerprint from Mercado Pago's security script: feeds their anti-fraud analysis.
      ...(init.dispositivo ? { 'X-meli-session-id': init.dispositivo } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resposta.ok) {
    // Only the status and Mercado Pago's error code are logged: the body may echo payer data.
    const detalhe = (await resposta.json().catch(() => null)) as { error?: string; message?: string } | null;
    const erro = `Mercado Pago ${resposta.status} em ${caminho.split('?')[0]}: ${detalhe?.error ?? ''}`;
    ultimoErro = {
      quando: new Date().toISOString(),
      status: resposta.status,
      caminho: caminho.split('?')[0],
      codigo: detalhe?.error ?? null,
      mensagem: detalhe?.message?.slice(0, 200) ?? null,
    };
    // The account's authorization no longer works (revoked on Mercado Pago, or expired): not the
    // guest's fault, so it is "payments unavailable", not a refused card.
    if (resposta.status === 401) throw new ContaNaoConectada(erro);
    // A refused request (bad or expired card token, invalid data): nothing was charged. Anything else
    // (409, 429, 5xx…) is treated as "unknown": the payment may exist and gets reconciled.
    if ([400, 403, 404].includes(resposta.status)) throw new PagamentoRecusadoPeloMercadoPago(erro);
    throw new Error(erro);
  }
  return (await resposta.json()) as T;
}

// What the browser sends from the Payment Brick (card) or the Pix choice. Never the amount: the
// API sets it from the database.
export type DadosPagamento =
  | { metodo: 'cartao'; token: string; paymentMethodId: string; issuerId: string | null; parcelas: number }
  | { metodo: 'pix' };

export type PagadorPagamento = { nome: string; email: string; cpf: string };

type ItemPagamento = { uid: string; nome: string; quantidade: number; precoCentavos: number };

// Mercado Pago wants the expiry with an explicit offset, e.g. 2026-10-30T12:00:00.000-03:00.
function dataComFuso(data: Date): string {
  const brasilia = new Date(data.getTime() - 3 * 3_600_000);
  return brasilia.toISOString().replace('Z', '-03:00');
}

// Creates the payment for an order. The order's UUID is both the idempotency key (a retry of the
// same request can't charge twice) and the external_reference that ties the payment to the order.
export async function criarPagamento(pedido: {
  uid: string;
  totalCentavos: number;
  itens: ItemPagamento[];
  pagador: PagadorPagamento;
  dados: DadosPagamento;
  dispositivo?: string;
}): Promise<Pagamento> {
  const [nome, ...sobrenome] = pedido.pagador.nome.trim().split(/\s+/);
  const pagador = {
    email: pedido.pagador.email,
    first_name: nome,
    last_name: sobrenome.join(' ') || undefined,
    identification: { type: 'CPF', number: pedido.pagador.cpf },
  };
  const comum = {
    transaction_amount: pedido.totalCentavos / 100,
    description: pedido.itens.length === 1 ? `Presente: ${pedido.itens[0].nome}` : `Presentes de casamento (${pedido.itens.length})`,
    external_reference: pedido.uid,
    // source_news=webhooks: only the Webhooks notice, not the old IPN as well.
    notification_url: `${config.siteUrl}/api/mercadopago/webhook?source_news=webhooks`,
    statement_descriptor: 'NAYARA E VICTOR',
    payer: pagador,
    additional_info: {
      items: pedido.itens.map((i) => ({
        id: i.uid,
        title: i.nome,
        description: `Presente de casamento: ${i.nome}`,
        category_id: 'others',
        quantity: i.quantidade,
        unit_price: i.precoCentavos / 100,
      })),
      payer: { first_name: pagador.first_name, last_name: pagador.last_name },
    },
  };
  const corpo =
    pedido.dados.metodo === 'pix'
      ? { ...comum, payment_method_id: 'pix', date_of_expiration: dataComFuso(new Date(Date.now() + PIX_MINUTOS * 60_000)) }
      : {
          ...comum,
          token: pedido.dados.token,
          payment_method_id: pedido.dados.paymentMethodId,
          ...(pedido.dados.issuerId ? { issuer_id: pedido.dados.issuerId } : {}),
          installments: pedido.dados.parcelas,
          // Approved or rejected right away: no "under review" state holding the gift.
          binary_mode: true,
        };
  return mp<Pagamento>('/v1/payments', { method: 'POST', body: corpo, idempotencia: pedido.uid, dispositivo: pedido.dispositivo });
}

export type Pagamento = {
  id: number;
  status: string;
  status_detail?: string;
  date_of_expiration?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
  external_reference: string | null;
  payment_type_id: string | null;
  payment_method_id: string | null;
  transaction_amount: number;
  currency_id: string;
  fee_details?: Array<{ type: string; amount: number }>;
  transaction_details?: { net_received_amount?: number };
};

const formas: Record<string, string> = {
  credit_card: 'card',
  debit_card: 'card',
  prepaid_card: 'card',
  account_money: 'mercadopago',
  ticket: 'boleto',
};

function statusDoPagamento(p: Pagamento): StatusPedido | null {
  switch (p.status) {
    case 'refunded':
    case 'charged_back':
      return 'estornado';
    case 'approved':
      return 'pago';
    case 'pending':
    case 'in_process':
    case 'authorized':
      return 'aguardando';
    case 'rejected':
    case 'cancelled':
      return 'falhou';
    default:
      return null;
  }
}

// Brings one payment into its order (found by external_reference = the order's UUID). Returns the
// internal id of an order that has just become paid, so the receipt can go out.
export async function sincronizarPagamento(p: Pagamento): Promise<number | null> {
  const status = statusDoPagamento(p);
  if (!status || !p.external_reference) return null;
  const pedido = await queryOne<{
    id: number;
    total_centavos: number;
    status: StatusPedido;
    mp_pagamento_id: string | null;
    mp_preferencia_id: string | null;
  }>(
    "SELECT id, total_centavos, status, mp_pagamento_id, mp_preferencia_id FROM pedidos WHERE uid::text = $1 AND gateway = 'mercadopago'",
    [p.external_reference],
  );
  if (!pedido) return null;
  // A refund or chargeback is the only way out of a paid order; it frees the gifts again.
  if (status === 'estornado') {
    await query("UPDATE pedidos SET status = 'estornado' WHERE id = $1 AND status = 'pago'", [pedido.id]);
    return null;
  }
  if (pedido.status === 'pago' || pedido.status === 'estornado') return null;
  // Each in-site order has exactly one payment, so only that payment can fail it (a refused card, an
  // expired Pix). Orders from the old Checkout Pro page could get several attempts: there only the
  // payment the order was waiting on counts, so a late notice of an older attempt can't fail it.
  const doPedido = pedido.mp_preferencia_id
    ? pedido.status === 'aguardando' && pedido.mp_pagamento_id === String(p.id)
    : pedido.mp_pagamento_id === null || pedido.mp_pagamento_id === String(p.id);
  if (status === 'falhou' && !doPedido) return null;
  // The amount is set by the API, but never mark as paid something that paid less.
  if (status === 'pago' && (p.currency_id !== 'BRL' || Math.round(p.transaction_amount * 100) < pedido.total_centavos)) {
    return null;
  }

  const taxa = (p.fee_details ?? []).filter((f) => f.type === 'mercadopago_fee').reduce((s, f) => s + f.amount, 0);
  const liquido = p.transaction_details?.net_received_amount;
  const pix = p.payment_type_id === 'bank_transfer' && p.payment_method_id === 'pix';
  const forma = pix ? 'pix' : (formas[p.payment_type_id ?? ''] ?? p.payment_type_id);
  const bandeira = forma === 'card' ? p.payment_method_id : null;
  // A Pix waiting to be paid: keep its code so the guest can see it again after a reload.
  const qr = status === 'aguardando' && pix ? p.point_of_interaction?.transaction_data : undefined;
  const atualizado = await queryOne<{ id: number }>(
    `UPDATE pedidos
        SET status = $2,
            mp_pagamento_id = $3,
            forma_pagamento = coalesce($4, forma_pagamento),
            bandeira = coalesce($5, bandeira),
            taxa_centavos = CASE WHEN $2 = 'pago' THEN $6 ELSE taxa_centavos END,
            liquido_centavos = CASE WHEN $2 = 'pago' THEN $7 ELSE liquido_centavos END,
            pago_em = CASE WHEN $2 = 'pago' THEN coalesce(pago_em, now()) ELSE pago_em END,
            pix_codigo = CASE WHEN $2 = 'aguardando' THEN coalesce($8, pix_codigo) END,
            pix_qr = CASE WHEN $2 = 'aguardando' THEN coalesce($9, pix_qr) END,
            pix_expira_em = CASE WHEN $2 = 'aguardando' THEN coalesce($10, pix_expira_em) END
      WHERE id = $1 AND status <> 'pago'
      RETURNING id`,
    [
      pedido.id,
      status,
      String(p.id),
      forma ?? null,
      bandeira ?? null,
      status === 'pago' ? Math.round(taxa * 100) : null,
      status === 'pago' && liquido !== undefined ? Math.round(liquido * 100) : null,
      qr?.qr_code ?? null,
      qr?.qr_code_base64 ?? null,
      qr && p.date_of_expiration ? p.date_of_expiration : null,
    ],
  );
  return atualizado && status === 'pago' ? atualizado.id : null;
}

export const buscarPagamento = (id: string) => mp<Pagamento>(`/v1/payments/${encodeURIComponent(id)}`);

// For the return page when the webhook hasn't arrived yet: the latest payment of this order.
export async function ultimoPagamentoDoPedido(uid: string): Promise<Pagamento | null> {
  const busca = await mp<{ results: Pagamento[] }>(
    `/v1/payments/search?external_reference=${encodeURIComponent(uid)}&sort=date_created&criteria=desc&limit=1`,
  );
  return busca.results[0] ?? null;
}
