import { defineRemoteConfig } from '@nv/shared/remote-config';

export default defineRemoteConfig('mural', {
  './Galeria': './src/Galeria.tsx',
  './Recados': './src/Recados.tsx',
});
