import { api } from '@nv/shared/api';
import type { PedidoCriado, PedidoInput, PedidoPublico } from '@nv/shared/types';
import type { ItemCarrinho } from './carrinho';

export type Convidado = { nome: string; email: string; mensagem: string };
export type Pedido = { itens: ItemCarrinho[]; totalCentavos: number; convidado: Convidado };

// Creates the order on the API (prices are recalculated there) and returns the
// URL of Stripe's hosted Checkout page for the guest to pay.
export async function criarPagamento(pedido: Pedido): Promise<string> {
  const body: PedidoInput = {
    itens: pedido.itens.map((i) => ({ presenteId: i.id, quantidade: i.quantidade })),
    convidado: pedido.convidado,
  };
  const { url } = await api<PedidoCriado>('/public/pedidos', { method: 'POST', body });
  const sessao = url.match(/cs_[A-Za-z0-9_]+/)?.[0];
  try {
    if (sessao) sessionStorage.setItem(SESSAO_PENDENTE, sessao);
  } catch {
    // storage blocked: the reservation simply times out on its own
  }
  return url;
}

const SESSAO_PENDENTE = 'nv_sessao_stripe_pendente';

// The guest came back without paying (cancelled, or the browser's back button):
// release the gifts that checkout reserved. `exceto` is a session that was paid.
export async function cancelarPagamentoPendente(exceto?: string): Promise<boolean> {
  let sessao: string | null = null;
  try {
    sessao = sessionStorage.getItem(SESSAO_PENDENTE);
    sessionStorage.removeItem(SESSAO_PENDENTE);
  } catch {
    return false;
  }
  if (!sessao || sessao === exceto) return false;
  await api(`/public/pedidos/${encodeURIComponent(sessao)}/cancelar`, { method: 'POST' }).catch(() => {});
  return true;
}

export const consultarPedido = (sessionId: string) =>
  api<PedidoPublico>(`/public/pedidos/${encodeURIComponent(sessionId)}`);

// Stripe sends the guest back to /?pedido=<session id> (or =cancelado).
export function lerRetornoDoStripe(): { tipo: 'sucesso'; sessionId: string } | { tipo: 'cancelado' } | null {
  const valor = new URLSearchParams(location.search).get('pedido');
  if (!valor) return null;
  if (valor === 'cancelado') return { tipo: 'cancelado' };
  return /^cs_[A-Za-z0-9_]+$/.test(valor) ? { tipo: 'sucesso', sessionId: valor } : null;
}

export function limparRetornoDaUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('pedido');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}
