import { defineRemoteConfig } from '@nv/shared/remote-config';

export default defineRemoteConfig('presentes', {
  './Presentes': './src/Presentes.tsx',
  './Presentear': './src/Presentear.tsx',
});
