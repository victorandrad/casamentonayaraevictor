import { useEffect, useReducer } from 'react';
import type { Presente } from '@nv/shared/types';

// `maximo`: units still available for this gift (null = unlimited, e.g. cotas).
export type ItemCarrinho = { id: number; nome: string; valorCentavos: number; quantidade: number; maximo: number | null };

type Acao =
  | { tipo: 'adicionar'; presente: Presente }
  | { tipo: 'quantidade'; id: number; quantidade: number }
  | { tipo: 'remover'; id: number }
  | { tipo: 'sincronizar'; presentes: Presente[] }
  | { tipo: 'limpar' };

const STORAGE_KEY = 'nv_carrinho_presentes';
export const MAX_QUANTIDADE = 10;

// The cart is a per-visitor convenience kept in this browser only.
function carregar(): ItemCarrinho[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(salvo) ? salvo.map((i) => ({ maximo: null, ...i })) : [];
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(itens));
    } catch {
      // storage blocked: the cart still works for this visit
    }
  }, [itens]);

  const total = itens.reduce((soma, i) => soma + i.valorCentavos * i.quantidade, 0);
  const quantidade = itens.reduce((soma, i) => soma + i.quantidade, 0);
  return { itens, total, quantidade, dispatch };
}
