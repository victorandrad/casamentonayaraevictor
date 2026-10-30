import { api } from '@nv/shared/api';
import { precoComTaxa } from '@nv/shared/taxas';
import type { ListaPresentes } from '@nv/shared/types';

// The gift list as guests see it: each gift with the payment fee already included (the API charges
// the same price, with the same rule).
export async function buscarLista(): Promise<ListaPresentes> {
  const data = await api<ListaPresentes>('/public/presentes');
  return { ...data, presentes: data.presentes.map((p) => ({ ...p, valorCentavos: precoComTaxa(p.valorCentavos, data.taxa) })) };
}
