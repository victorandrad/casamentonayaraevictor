// Gallery content. Add `src` (and `alt`) to a photo once the real picture is ready;
// until then it shows as a soft placeholder with its caption.
export type Momento = 'nos' | 'pedido' | 'viagens' | 'familia';

export type Foto = {
  id: string;
  legenda: string;
  momento: Momento;
  src?: string;
  alt?: string;
};

export const momentos: Array<{ id: Momento | 'todos'; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'nos', label: 'Nós dois' },
  { id: 'pedido', label: 'O pedido' },
  { id: 'viagens', label: 'Viagens' },
  { id: 'familia', label: 'Família' },
];

export const fotos: Foto[] = [
  { id: 'casal', legenda: 'Foto do casal', momento: 'nos' },
  { id: 'pedido', legenda: 'O pedido', momento: 'pedido' },
  { id: 'viagem', legenda: 'Primeira viagem', momento: 'viagens' },
  { id: 'ensaio', legenda: 'Ensaio', momento: 'nos' },
  { id: 'familia', legenda: 'Família', momento: 'familia' },
  { id: 'nos-dois', legenda: 'Nós dois', momento: 'nos' },
];
