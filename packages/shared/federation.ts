// Registry of the microfrontends: name used by Module Federation and dev port.
// In production each app URL can be overridden with MF_<NAME>_URL
// (e.g. MF_EVENTO_URL=https://evento.nayaraevictor.com.br).
export const apps = {
  shell: { port: 4000 },
  evento: { port: 4001 },
  rsvp: { port: 4002 },
  presentes: { port: 4003 },
  mural: { port: 4004 },
  painel: { port: 4005 },
} as const;

// Dev servers forward /api to the API (Docker container on 4100 by default).
export const apiProxy = { '/api': process.env.API_URL ?? 'http://localhost:4100' };

export type AppName = keyof typeof apps;
export type RemoteName = Exclude<AppName, 'shell'>;

export function appUrl(name: AppName): string {
  const fromEnv = process.env[`MF_${name.toUpperCase()}_URL`];
  return (fromEnv ?? `http://localhost:${apps[name].port}`).replace(/\/$/, '');
}

// React must be a single instance across host and remotes.
export const sharedDeps = {
  react: { singleton: true, requiredVersion: '^19.0.0' },
  'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
};
