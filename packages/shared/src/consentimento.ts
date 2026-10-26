import { useEffect, useState } from 'react';

// Cookie consent. The site itself only keeps essential data in the browser (cart, pending payment,
// the map opening, the panel login), which needs no consent. Each optional category is a flag the
// guest turns on or off; today the only one is the Google Maps embed, which sets Google's own cookies.
// The choice lives in localStorage and is broadcast with a window event so every micro-frontend
// (shell notice, evento map) sees it at once.
export type Consentimento = { mapa: boolean };

export const CONSENTIMENTO_TOTAL: Consentimento = { mapa: true };
export const SO_ESSENCIAIS: Consentimento = { mapa: false };

const CHAVE = 'nv_cookies';
const MUDOU = 'nv:consentimento';
const PREFERENCIAS = 'nv:consentimento-preferencias';

export function lerConsentimento(): Consentimento | null {
  let valor: string | null;
  try {
    valor = localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
  // First version stored a single word for all-or-nothing.
  if (valor === 'todos') return CONSENTIMENTO_TOTAL;
  if (valor === 'essenciais') return SO_ESSENCIAIS;
  try {
    const salvo: unknown = JSON.parse(valor ?? '');
    if (salvo && typeof salvo === 'object' && typeof (salvo as Consentimento).mapa === 'boolean') {
      return { mapa: (salvo as Consentimento).mapa };
    }
  } catch {
    // nothing saved, or something unreadable: ask again
  }
  return null;
}

export function salvarConsentimento(valor: Consentimento) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(valor));
  } catch {
    // storage blocked: the choice lasts until the page is reloaded
  }
  window.dispatchEvent(new CustomEvent<Consentimento>(MUDOU, { detail: valor }));
}

export function useConsentimento(): Consentimento | null {
  const [valor, setValor] = useState(lerConsentimento);
  useEffect(() => {
    const aoMudar = (e: Event) => setValor((e as CustomEvent<Consentimento>).detail);
    window.addEventListener(MUDOU, aoMudar);
    return () => window.removeEventListener(MUDOU, aoMudar);
  }, []);
  return valor;
}

// Reopens the cookie notice (footer link) so the guest can change their choice.
export const abrirPreferenciasDeCookies = () => window.dispatchEvent(new Event(PREFERENCIAS));

export function useAbrirPreferenciasDeCookies(aoAbrir: () => void) {
  useEffect(() => {
    window.addEventListener(PREFERENCIAS, aoAbrir);
    return () => window.removeEventListener(PREFERENCIAS, aoAbrir);
  }, [aoAbrir]);
}
