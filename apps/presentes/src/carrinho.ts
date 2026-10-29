import { useEffect, useReducer } from 'react';
import type { Presente } from '@nv/shared/types';

// `maximo`: units still available for this gift (null = unlimited, e.g. cotas).
export type ItemCarrinho = { id: string; nome: string; valorCentavos: number; quantidade: number; maximo: number | null };

type Acao =
  | { tipo: 'adicionar'; presente: Presente }
  | { tipo: 'quantidade'; id: string; quantidade: number }
  | { tipo: 'remover'; id: string }
  | { tipo: 'sincronizar'; presentes: Presente[] }
  | { tipo: 'limpar' };

const STORAGE_KEY = 'nv_carrinho_presentes';
export const MAX_QUANTIDADE = 10;
// A cart nobody touched for this long is forgotten. Only the guest's own changes count: opening the
// site (which syncs prices and availability) doesn't renew it.
export const VALIDADE_CARRINHO_MS = 24 * 60 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The cart is a per-visitor convenience kept in this browser only, and the browser can be edited by
// anyone. So only which gifts and how many are saved, checked on the way back in; name, price and
// availability always come from the API (the 'sincronizar' action, as soon as the list loads), and
// the API recalculates everything again when the order is created.
type ItemSalvo = { id: string; quantidade: number };
// `alteradoEm`: when the guest last changed the cart (ms). Carts saved before it existed were plain arrays.
type CarrinhoSalvo = { itens: ItemSalvo[]; alteradoEm: number };

function lerSalvo(): CarrinhoSalvo | null {
  try {
    const salvo: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (Array.isArray(salvo)) return { itens: salvo, alteradoEm: Date.now() };
    if (salvo && typeof salvo === 'object' && Array.isArray((salvo as CarrinhoSalvo).itens)) {
      const { itens, alteradoEm } = salvo as CarrinhoSalvo;
      return { itens, alteradoEm: Number.isFinite(alteradoEm) ? alteradoEm : 0 };
    }
    return null;
  } catch {
    return null;
  }
}

function carregar(): ItemCarrinho[] {
  const salvo = lerSalvo();
  if (!salvo || Date.now() - salvo.alteradoEm > VALIDADE_CARRINHO_MS) return [];
  try {
    return salvo.itens
      .filter(
        (i): i is ItemSalvo =>
          typeof i?.id === 'string' && UUID.test(i.id) && Number.isInteger(i.quantidade) && i.quantidade >= 1 && i.quantidade <= MAX_QUANTIDADE,
      )
      .map(({ id, quantidade }) => ({ id, quantidade, nome: '', valorCentavos: 0, maximo: null }));
  } catch {
    return [];
  }
}

const limite = (maximo: number | null) => Math.min(MAX_QUANTIDADE, maximo ?? MAX_QUANTIDADE);

function reducer(itens: ItemCarrinho[], acao: Acao): ItemCarrinho[] {
  switch (acao.tipo) {
    case 'adicionar': {
      const { id, nome, valorCentavos, disponivel } = acao.presente;
      if (disponivel === 0) return itens;
      const existente = itens.find((i) => i.id === id);
      if (existente) {
        return itens.map((i) => (i.id === id ? { ...i, quantidade: Math.min(limite(disponivel), i.quantidade + 1) } : i));
      }
      return [...itens, { id, nome, valorCentavos, quantidade: 1, maximo: disponivel }];
    }
    case 'quantidade':
      return itens.map((i) =>
        i.id === acao.id ? { ...i, quantidade: Math.max(1, Math.min(limite(i.maximo), acao.quantidade)) } : i,
      );
    case 'remover':
      return itens.filter((i) => i.id !== acao.id);
    case 'sincronizar': {
      // Drop gifts that were removed or already given, pick up price/name
      // changes and fit quantities to what is still available.
      const atuais = new Map(acao.presentes.map((p) => [p.id, p]));
      return itens.flatMap((i) => {
        const p = atuais.get(i.id);
        if (!p || p.disponivel === 0) return [];
        return [{ ...i, nome: p.nome, valorCentavos: p.valorCentavos, maximo: p.disponivel, quantidade: Math.min(i.quantidade, limite(p.disponivel)) }];
      });
    }
    case 'limpar':
      return [];
  }
}

export function useCarrinho() {
  const [itens, dispatch] = useReducer(reducer, undefined, carregar);

  useEffect(() => {
    try {
      const salvar: ItemSalvo[] = itens.map(({ id, quantidade }) => ({ id, quantidade }));
      // Same gifts and quantities as saved (e.g. only prices synced): keep the date, so a visit alone
      // doesn't extend the cart's life.
      const anterior = lerSalvo();
      const mudou = !anterior || JSON.stringify(anterior.itens) !== JSON.stringify(salvar);
      const alteradoEm = mudou ? Date.now() : anterior.alteradoEm;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ itens: salvar, alteradoEm } satisfies CarrinhoSalvo));
    } catch {
      // storage blocked: the cart still works for this visit
    }
  }, [itens]);

  // A tab left open past the limit: empty the cart when the guest comes back to it.
  useEffect(() => {
    const aoVoltar = () => {
      const salvo = lerSalvo();
      if (document.visibilityState === 'visible' && salvo && salvo.itens.length > 0 && Date.now() - salvo.alteradoEm > VALIDADE_CARRINHO_MS) {
        dispatch({ tipo: 'limpar' });
      }
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  const total = itens.reduce((soma, i) => soma + i.valorCentavos * i.quantidade, 0);
  const quantidade = itens.reduce((soma, i) => soma + i.quantidade, 0);
  return { itens, total, quantidade, dispatch };
}
