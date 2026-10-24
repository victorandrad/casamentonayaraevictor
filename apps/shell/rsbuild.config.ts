import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { apiProxy, appUrl, apps, sharedDeps, type RemoteName } from '@nv/shared/federation';

const remoteNames: RemoteName[] = ['evento', 'rsvp', 'presentes', 'mural', 'painel'];

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'shell',
      remotes: Object.fromEntries(
        remoteNames.map((name) => [name, `${name}@${appUrl(name)}/mf-manifest.json`]),
      ),
      shared: sharedDeps,
      dts: false,
    }),
  ],
  // historyApiFallback serves index.html for /painel
  server: { port: apps.shell.port, proxy: apiProxy, historyApiFallback: true },
  html: {
    title: 'Nayara & Victor · 28.08.2027',
    meta: {
      description: 'Casamento de Nayara e Victor · 28 de agosto de 2027 · Itu, SP',
      'theme-color': '#f6f1ea',
      // Declares a dark theme (the same light palette, see theme.css) so forced dark modes —
      // Samsung Internet, Chrome auto-dark — leave the page alone; "only light" is ignored by Samsung.
      'color-scheme': 'light dark',
    },
    // Icons live in public/ (copied to the site root as-is). Rsbuild already
    // links public/favicon.svg on its own; these are the fallbacks and app icons.
    tags: [
      { tag: 'link', attrs: { rel: 'icon', href: '/favicon-32.png', type: 'image/png', sizes: '32x32' } },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
      { tag: 'link', attrs: { rel: 'manifest', href: '/site.webmanifest' } },
    ],
  },
});
