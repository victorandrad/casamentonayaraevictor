import { defineRemoteConfig } from '@nv/shared/remote-config';

export default defineRemoteConfig('rsvp', {
  './Rsvp': './src/Rsvp.tsx',
  './Portaria': './src/Portaria.tsx',
});
