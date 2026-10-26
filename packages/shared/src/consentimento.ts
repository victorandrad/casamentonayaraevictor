import { useEffect, useState } from 'react';

// Cookie consent. The site itself only keeps essential data in the browser (cart, pending payment,
// the map opening, the panel login); the one optional item is the Google Maps embed, which sets
// Google's own cookies. The choice lives in localStorage and is broadcast with a window event so
// every micro-frontend (shell banner, evento map) sees it at once.
export type Consentimento = 'todos' | 'essenciais';

const CHAVE = 'nv_cookies';
const MUDOU = 'nv:consentimento';
const PREFERENCIAS = 'nv:consentimento-preferencias';

export function lerConsentimento(): Consentimento | null {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === 'todos' || valor === 'essenciais' ? valor : null;
  } catch {
    return null;
  }
}

export function salvarConsentimento(valor: Consentimento) {
  try {
    localStorage.setItem(CHAVE, valor);
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
