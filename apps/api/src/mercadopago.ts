// Mercado Pago Checkout Pro: the guest pays on Mercado Pago's own page (Pix, card, Mercado Pago
// balance), like Stripe Checkout. The order is created here first (prices from the database), then
// a "preference" with the same items; the webhook and the return page bring the payment back.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { StatusPedido } from '@nv/shared/types';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';

const API = 'https://api.mercadopago.com';
// How long the guest has to pay (the same 30 minutes the Stripe session gets; the reservation of
// unique gifts lasts a little longer, see RESERVA_MINUTOS).
const VALIDADE_MINUTOS = 30;
// A Pix generated on that page must be paid within this time; past it Mercado Pago cancels it and
// the gifts it was holding are freed (a pending payment keeps them reserved).
const PIX_MINUTOS = 60;

export const mercadoPagoConfigurado = () => Boolean(config.mercadoPago.accessToken);
// Test credentials (TEST-…) open the sandbox checkout page.
const modoTeste = () => config.mercadoPago.accessToken.startsWith('TEST-');

async function mp<T>(caminho: string, init: { method?: string; body?: unknown; idempotencia?: string } = {}): Promise<T> {
  const resposta = await fetch(`${API}${caminho}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${config.mercadoPago.accessToken}`,
      'Content-Type': 'application/json',
      ...(init.idempotencia ? { 'X-Idempotency-Key': init.idempotencia } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(`Mercado Pago ${resposta.status} em ${caminho}: ${detalhe.slice(0, 300)}`);
  }
  return (await resposta.json()) as T;
}

type ItemPreferencia = { uid: string; nome: string; quantidade: number; precoCentavos: number };

// Creates the Checkout Pro preference for an order and returns the page to send the guest to.
export async function criarPreferencia(pedido: {
  uid: string;
  nome: string;
  email: string;
  itens: ItemPreferencia[];
}): Promise<{ id: string; url: string }> {
  const agora = new Date();
  const ate = new Date(agora.getTime() + VALIDADE_MINUTOS * 60_000);
  const volta = `${config.siteUrl}/?pedido=${pedido.uid}#presentes`;
  const [nome, ...sobrenome] = pedido.nome.trim().split(/\s+/);
  const preferencia = await mp<{ id: string; init_point: string; sandbox_init_point: string }>('/checkout/preferences', {
    method: 'POST',
    idempotencia: pedido.uid,
    body: {
      items: pedido.itens.map((i) => ({
        id: i.uid,
        title: i.nome,
        description: `Presente de casamento: ${i.nome}`,
        category_id: 'others',
        quantity: i.quantidade,
        unit_price: i.precoCentavos / 100,
        currency_id: 'BRL',
      })),
      payer: { name: nome, surname: sobrenome.join(' ') || undefined, email: pedido.email },
      // The order's public UUID: the only order identifier that leaves the database.
      external_reference: pedido.uid,
      back_urls: { success: volta, pending: volta, failure: `${config.siteUrl}/?pedido=cancelado#presentes` },
      auto_return: 'approved',
      // source_news=webhooks: only the signed Webhooks notice, not the old unsigned IPN as well.
      notification_url: `${config.siteUrl}/api/mercadopago/webhook?source_news=webhooks`,
      statement_descriptor: 'NAYARA E VICTOR',
      // Boleto takes days to clear and would hold unique gifts all that time: Pix and cards only.
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }] },
      expires: true,
      expiration_date_from: agora.toISOString(),
      expiration_date_to: ate.toISOString(),
      date_of_expiration: new Date(agora.getTime() + PIX_MINUTOS * 60_000).toISOString(),
    },
  });
  return { id: preferencia.id, url: modoTeste() ? preferencia.sandbox_init_point : preferencia.init_point };
}

// The guest gave up: close the preference so the gifts it reserved can't be paid for any more.
export async function expirarPreferencia(id: string): Promise<void> {
  await mp(`/checkout/preferences/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { expires: true, expiration_date_to: new Date().toISOString() },
  });
}

type Pagamento = {
  id: number;
  status: string;
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
  const pedido = await queryOne<{ id: number; total_centavos: number; status: StatusPedido; mp_pagamento_id: string | null }>(
    "SELECT id, total_centavos, status, mp_pagamento_id FROM pedidos WHERE uid::text = $1 AND gateway = 'mercadopago'",
    [p.external_reference],
  );
  if (!pedido) return null;
  // A refund or chargeback is the only way out of a paid order; it frees the gifts again.
  if (status === 'estornado') {
    await query("UPDATE pedidos SET status = 'estornado' WHERE id = $1 AND status = 'pago'", [pedido.id]);
    return null;
  }
  if (pedido.status === 'pago' || pedido.status === 'estornado') return null;
  // A refused card doesn't end the order: the guest can try again (another card, Pix) on the same
  // page, so the gifts stay reserved until the preference runs out. Only the payment the order is
  // waiting on (a Pix or boleto that expired) can fail it; a late notice of an older attempt can't.
  if (status === 'falhou' && (pedido.status !== 'aguardando' || pedido.mp_pagamento_id !== String(p.id))) return null;
  // The preference fixes the amount, but never mark as paid something that paid less.
  if (status === 'pago' && (p.currency_id !== 'BRL' || Math.round(p.transaction_amount * 100) < pedido.total_centavos)) {
    return null;
  }

  const taxa = (p.fee_details ?? []).filter((f) => f.type === 'mercadopago_fee').reduce((s, f) => s + f.amount, 0);
  const liquido = p.transaction_details?.net_received_amount;
  const pix = p.payment_type_id === 'bank_transfer' && p.payment_method_id === 'pix';
  const forma = pix ? 'pix' : (formas[p.payment_type_id ?? ''] ?? p.payment_type_id);
  const bandeira = forma === 'card' ? p.payment_method_id : null;
  const atualizado = await queryOne<{ id: number }>(
    `UPDATE pedidos
        SET status = $2,
            mp_pagamento_id = $3,
            forma_pagamento = coalesce($4, forma_pagamento),
            bandeira = coalesce($5, bandeira),
            taxa_centavos = CASE WHEN $2 = 'pago' THEN $6 ELSE taxa_centavos END,
            liquido_centavos = CASE WHEN $2 = 'pago' THEN $7 ELSE liquido_centavos END,
            pago_em = CASE WHEN $2 = 'pago' THEN coalesce(pago_em, now()) ELSE pago_em END
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

// Webhook signature: x-signature "ts=…,v1=…" is an HMAC-SHA256 of
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" with the application's secret.
// Notices more than 5 minutes off are refused, so a captured one can't be replayed later.
const JANELA_MS = 5 * 60_000;

export function assinaturaValida(cabecalho: string | undefined, requestId: string | undefined, dataId: string, agora = Date.now()): boolean {
  if (!cabecalho || !config.mercadoPago.webhookSecret) return false;
  const partes = Object.fromEntries(cabecalho.split(',').map((p) => p.trim().split('=') as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const ts = Number(partes.ts);
  const tsMs = ts > 1e12 ? ts : ts * 1000; // seconds or milliseconds
  if (!Number.isFinite(tsMs) || Math.abs(agora - tsMs) > JANELA_MS) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifesto = `id:${id};${requestId ? `request-id:${requestId};` : ''}ts:${partes.ts};`;
  const esperado = createHmac('sha256', config.mercadoPago.webhookSecret).update(manifesto).digest('hex');
  const a = Buffer.from(esperado);
  const b = Buffer.from(partes.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Lets the database forget a preference that never got a payment (used when cancelling).
export async function preferenciaDoPedido(uid: string): Promise<string | null> {
  const linha = await queryOne<{ mp_preferencia_id: string | null }>(
    "SELECT mp_preferencia_id FROM pedidos WHERE uid = $1 AND gateway = 'mercadopago' AND status = 'pendente'",
    [uid],
  );
  return linha?.mp_preferencia_id ?? null;
}

export async function marcarExpirado(uid: string): Promise<void> {
  await query("UPDATE pedidos SET status = 'expirado' WHERE uid = $1 AND status = 'pendente'", [uid]);
}
