// Moments that group the gallery photos (filters on the site, select in the panel).
export const MOMENTOS = [
  { id: 'nos', label: 'Nós dois' },
  { id: 'pedido', label: 'O pedido' },
  { id: 'viagens', label: 'Viagens' },
  { id: 'familia', label: 'Família' },
  { id: 'casamento', label: 'O casamento' },
] as const;

export type Momento = (typeof MOMENTOS)[number]['id'];
export const IDS_MOMENTOS = MOMENTOS.map((m) => m.id) as Momento[];
export const rotuloMomento = (id: string) => MOMENTOS.find((m) => m.id === id)?.label ?? id;
