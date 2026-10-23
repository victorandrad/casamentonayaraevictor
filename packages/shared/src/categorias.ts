// Icons the couple can pick for a gift category (names from ornaments.tsx).
export const ICONES_CATEGORIA = ['gift', 'cocktail', 'home', 'heart', 'rings', 'cheers', 'plane', 'camera', 'calendar'] as const;
export type IconeCategoria = (typeof ICONES_CATEGORIA)[number];

export const ROTULO_ICONE: Record<IconeCategoria, string> = {
  gift: 'Presente',
  cocktail: 'Drinks',
  home: 'Casa',
  heart: 'Coração',
  rings: 'Alianças',
  cheers: 'Brinde',
  plane: 'Viagem',
  camera: 'Fotos',
  calendar: 'Experiências',
};

export const iconeDaCategoria = (icone: string): IconeCategoria =>
  (ICONES_CATEGORIA as readonly string[]).includes(icone) ? (icone as IconeCategoria) : 'gift';
