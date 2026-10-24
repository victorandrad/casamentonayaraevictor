import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { apiProxy, appUrl, apps, sharedDeps, type RemoteName } from '@nv/shared/federation';
import { casamento, locais } from '@nv/shared/config';

// ---- SEO: what search engines and link previews (WhatsApp, Instagram, Facebook…) read ----
const SITE = 'https://casamentonayaraevictor.com.br';
const TITULO = `${casamento.noiva} & ${casamento.noivo} · Casamento · 28.08.2027`;
const DESCRICAO =
  `Casamento de ${casamento.noiva} e ${casamento.noivo} em ${casamento.dataExtenso}, às ${locais.cerimonia.horario}, ` +
  `na ${locais.cerimonia.nome}, em ${casamento.cidade}. Confirme sua presença, veja a lista de presentes e deixe um recado.`;
const IMAGEM = `${SITE}/og.jpg`;
const og = (property: string, content: string) => ({ property, content });

// schema.org Event, so search engines can show the date and place of the wedding.
const evento = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: `Casamento de ${casamento.noiva} & ${casamento.noivo}`,
  description: DESCRICAO,
  url: `${SITE}/`,
  image: [IMAGEM],
  startDate: casamento.dataISO,
  eventStatus: 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  inLanguage: 'pt-BR',
  isAccessibleForFree: true,
  location: {
    '@type': 'Place',
    name: locais.cerimonia.nome,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'R. Gagliano Micai, s/n · Vila Cleto',
      addressLocality: 'Itu',
      addressRegion: 'SP',
      postalCode: '13310-282',
      addressCountry: 'BR',
    },
  },
  organizer: { '@type': 'Person', name: `${casamento.noiva} & ${casamento.noivo}`, url: `${SITE}/` },
};

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
    // lang="pt-BR" and a <noscript> summary for crawlers that don't run JavaScript
    template: './index.html',
    title: TITULO,
    meta: {
      description: DESCRICAO,
      robots: 'index, follow, max-image-preview:large',
      'og:type': og('og:type', 'website'),
      'og:locale': og('og:locale', 'pt_BR'),
      'og:site_name': og('og:site_name', `${casamento.noiva} & ${casamento.noivo}`),
      'og:title': og('og:title', TITULO),
      'og:description': og('og:description', DESCRICAO),
      'og:url': og('og:url', `${SITE}/`),
      'og:image': og('og:image', IMAGEM),
      'og:image:width': og('og:image:width', '1200'),
      'og:image:height': og('og:image:height', '630'),
      'og:image:alt': og('og:image:alt', `${casamento.noiva} & ${casamento.noivo} · ${casamento.dataCurta} · ${locais.cerimonia.nome}, ${casamento.cidade}`),
      'twitter:card': 'summary_large_image',
      'twitter:title': TITULO,
      'twitter:description': DESCRICAO,
      'twitter:image': IMAGEM,
      'theme-color': '#f6f1ea',
      // Declares a dark theme (the same light palette, see theme.css) so forced dark modes —
      // Samsung Internet, Chrome auto-dark — leave the page alone; "only light" is ignored by Samsung.
      'color-scheme': 'light dark',
    },
    // Icons live in public/ (copied to the site root as-is). Rsbuild already
    // links public/favicon.svg on its own; these are the fallbacks and app icons.
    tags: [
      { tag: 'link', attrs: { rel: 'canonical', href: `${SITE}/` } },
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
      { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(evento) },
      { tag: 'link', attrs: { rel: 'icon', href: '/favicon-32.png', type: 'image/png', sizes: '32x32' } },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
      { tag: 'link', attrs: { rel: 'manifest', href: '/site.webmanifest' } },
    ],
  },
});
