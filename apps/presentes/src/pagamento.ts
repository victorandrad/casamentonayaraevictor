import { api } from '@nv/shared/api';
import type { PedidoCriado, PedidoInput, PedidoPublico } from '@nv/shared/types';
import type { ItemCarrinho } from './carrinho';

export type Convidado = { nome: string; email: string; mensagem: string };
export type Pedido = { itens: ItemCarrinho[]; totalCentavos: number; convidado: Convidado };

// Creates the order on the API (prices are recalculated there) and returns the
// URL of Mercado Pago's payment page (Checkout Pro) for the guest to pay.
export async function criarPagamento(pedido: Pedido): Promise<string> {
  const body: PedidoInput = {
    itens: pedido.itens.map((i) => ({ presenteId: i.id, quantidade: i.quantidade })),
    convidado: pedido.convidado,
  };
  const criado = await api<PedidoCriado>('/public/pedidos', { method: 'POST', body });
  try {
    sessionStorage.setItem(PEDIDO_PENDENTE, criado.pedido);
  } catch {
    // storage blocked: the reservation simply times out on its own
  }
  return criado.url;
}

// Only the order's UUID is kept in the browser (never Mercado Pago's ids).
const PEDIDO_PENDENTE = 'nv_pedido_pendente';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The guest came back without paying (cancelled, or the browser's back button):
// release the gifts that checkout reserved. `exceto` is an order that was paid.
//
// The list must only load after the release has finished: until then the guest's own reservation
// makes a unique gift look taken, and syncing the cart would drop it. A call made while one is
// still running (React runs effects twice in development) waits for that same release instead of
// finding nothing to cancel and loading the list too early.
let liberando: Promise<boolean> | null = null;

export function cancelarPagamentoPendente(exceto?: string): Promise<boolean> {
  if (liberando) return liberando;
  let pedido: string | null;
  try {
    pedido = sessionStorage.getItem(PEDIDO_PENDENTE);
    sessionStorage.removeItem(PEDIDO_PENDENTE);
  } catch {
    return Promise.resolve(false);
  }
  if (!pedido || !UUID.test(pedido) || pedido === exceto) return Promise.resolve(false);
  liberando = api(`/public/pedidos/${pedido}/cancelar`, { method: 'POST' })
    .then(() => true)
    .catch(() => true)
    .finally(() => {
      liberando = null;
    });
  return liberando;
}

export const consultarPedido = (pedido: string) => api<PedidoPublico>(`/public/pedidos/${pedido}`);

// Mercado Pago sends the guest back to /?pedido=<order UUID> (or =cancelado), adding its own
// parameters about the payment, which the site doesn't use (the API asks Mercado Pago itself).
const PARAMETROS_DO_MERCADO_PAGO = [
  'collection_id',
  'collection_status',
  'payment_id',
  'status',
  'external_reference',
  'payment_type',
  'merchant_order_id',
  'preference_id',
  'site_id',
  'processing_mode',
  'merchant_account_id',
];

export function lerRetornoDoPagamento(): { tipo: 'sucesso'; pedido: string } | { tipo: 'cancelado' } | null {
  const valor = new URLSearchParams(location.search).get('pedido');
  if (!valor) return null;
  if (valor === 'cancelado') return { tipo: 'cancelado' };
  return UUID.test(valor) ? { tipo: 'sucesso', pedido: valor } : null;
}

export function limparRetornoDaUrl() {
  const url = new URL(location.href);
  for (const nome of ['pedido', ...PARAMETROS_DO_MERCADO_PAGO]) url.searchParams.delete(nome);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}
