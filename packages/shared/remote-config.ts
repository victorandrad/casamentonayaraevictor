import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { apiProxy, appUrl, apps, sharedDeps, type RemoteName } from './federation';

// Rsbuild config shared by every remote. `exposes` maps the public module
// name (imported by the shell as `<name>/<Module>`) to its source file.
export function defineRemoteConfig(name: RemoteName, exposes: Record<string, string>) {
  return defineConfig({
    plugins: [
      pluginReact(),
      pluginModuleFederation({ name, exposes, shared: sharedDeps, dts: false }),
    ],
    // Only the shell may load this remote's files cross-origin.
    server: { port: apps[name].port, cors: { origin: [appUrl('shell')] }, proxy: apiProxy },
    // Chunks must load from the remote's own origin, not the shell's.
    dev: { assetPrefix: 'auto' },
    output: { assetPrefix: 'auto' },
    html: { title: `Nayara & Victor · ${name} (standalone)` },
  });
}
