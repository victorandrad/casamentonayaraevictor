import { useEffect, useState } from 'react';
import { api } from './api';
import type { ConvitePublico } from './types';

// The guest's own invite, opened in the RSVP (personal link or typed code). Its code stays in
// localStorage so the rest of the site (the reception address, in evento) knows who is visiting on
// later visits too. The RSVP broadcasts it with a window event, since every microfrontend has its
// own copy of this module.
const CHAVE = 'nv_convite';
const ABRIU = 'nv:convite';

export function lembrarConvite(convite: ConvitePublico) {
  try {
    localStorage.setItem(CHAVE, convite.codigo);
  } catch {
    // storage blocked: the invite still counts for this visit
  }
  window.dispatchEvent(new CustomEvent<ConvitePublico>(ABRIU, { detail: convite }));
}

function codigoLembrado(): string | null {
  const doLink = location.hash.match(/convite=([A-Za-z0-9-]+)/)?.[1];
  if (doLink) return doLink;
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function useConvite(): ConvitePublico | null {
  const [convite, setConvite] = useState<ConvitePublico | null>(null);
  useEffect(() => {
    const aoAbrir = (e: Event) => setConvite((e as CustomEvent<ConvitePublico>).detail);
    window.addEventListener(ABRIU, aoAbrir);
    const codigo = codigoLembrado();
    const controle = new AbortController();
    if (codigo) {
      api<ConvitePublico>(`/public/convites/${encodeURIComponent(codigo)}`, { signal: controle.signal })
        .then((c) => setConvite((atual) => atual ?? c))
        .catch(() => {
          // deleted invite or offline: show only what is public
        });
    }
    return () => {
      window.removeEventListener(ABRIU, aoAbrir);
      controle.abort();
    };
  }, []);
  return convite;
}
