import type { LocalEvento } from '@nv/shared/types';

// The reception address lives only here, in the API: the site gets it from the invite lookup,
// and only for invites marked for the reception in the panel.
export const recepcao: LocalEvento = {
  nome: 'Recanto Espelho da Lua',
  horario: 'Após a cerimônia',
  linhas: ['Recanto Espelho da Lua', 'R. Domingos José da Cruz, 420', 'Jardim Itaguaçu · Salto, SP'],
  descricao:
    'Recanto Espelho da Lua · R. Domingos José da Cruz, 420 — Jardim Itaguaçu, Salto · SP, 13323-231. Um jantar para celebrarmos juntos, logo após a cerimônia, com estacionamento no local.',
  maps: 'https://www.google.com/maps/search/?api=1&query=Recanto+Espelho+da+Lua+R.+Domingos+Jos%C3%A9+da+Cruz+420+Jardim+Itaguacu+Salto+SP+13323-231',
  embed:
    'https://maps.google.com/maps?q=Recanto%20Espelho%20da%20Lua%20R.%20Domingos%20Jos%C3%A9%20da%20Cruz%20420%20Jardim%20Itaguacu%20Salto%20SP&z=15&output=embed',
};
