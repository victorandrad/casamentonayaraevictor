import { api } from '@nv/shared/api';
import type { ItensLinkCheckout, LinkCheckout } from '@nv/shared/types';
import type { ItemSalvo } from './carrinho';

// The checkout's address carries the cart as a link only the API can read or make
// (/presentear?c=<link>): the browser never sees inside it and can't change it.
export const PARAMETRO_LINK = 'c';

export const criarLink = (itens: ItemSalvo[]) =>
  api<LinkCheckout>('/public/checkout/link', {
    method: 'POST',
    body: { itens: itens.map((i) => ({ presenteId: i.id, quantidade: i.quantidade })) },
  });

export async function abrirLink(link: string): Promise<ItemSalvo[]> {
  const { itens } = await api<ItensLinkCheckout>(`/public/checkout/link/${encodeURIComponent(link)}`);
  return itens.map((i) => ({ id: i.presenteId, quantidade: i.quantidade }));
}

// The same gifts and amounts, in order: whether a link still matches the cart.
export const chaveDoCarrinho = (itens: ItemSalvo[]) => itens.map((i) => `${i.id}:${i.quantidade}`).join(',');
