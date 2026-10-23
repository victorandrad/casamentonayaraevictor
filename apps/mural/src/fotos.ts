// Gallery photos come from the API (the couple upload them in the panel, Galeria tab).
import { api } from '@nv/shared/api';
import { MOMENTOS, type Momento } from '@nv/shared/galeria';
import type { FotoGaleria } from '@nv/shared/types';

export type { Momento };

export type Foto = {
  id: string;
  legenda: string;
  momento: string;
  src?: string;
  alt?: string;
};

export const momentos: Array<{ id: Momento | 'todos'; label: string }> = [{ id: 'todos', label: 'Todos' }, ...MOMENTOS];

export async function carregarFotos(): Promise<Foto[]> {
  const lista = await api<FotoGaleria[]>('/public/galeria');
  return lista.map((f) => ({ id: String(f.id), legenda: f.legenda, momento: f.momento, src: f.url, alt: f.legenda || 'Nayara e Victor' }));
}
