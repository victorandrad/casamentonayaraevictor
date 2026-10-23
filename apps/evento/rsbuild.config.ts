import { defineRemoteConfig } from '@nv/shared/remote-config';

export default defineRemoteConfig('evento', {
  './Evento': './src/Evento.tsx',
  './Traje': './src/Traje.tsx',
  './Local': './src/Local.tsx',
});
