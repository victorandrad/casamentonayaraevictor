import { useEffect, useState } from 'react';

// Moving between the site's own pages (the gift checkout at /presentear, the home page) without
// reloading: the address changes with history.pushState and every part of the site listening (the
// shell and the microfrontends, each with its own copy of this module) hears it through a window
// event, the same one the browser's back/forward buttons fire.
const NAVEGOU = 'nv:navegou';

// `rolar: false` only rewrites the address (e.g. the checkout's link after the cart changed).
export function navegar(destino: string, { substituir = false, rolar = true } = {}) {
  const url = new URL(destino, location.href);
  if (substituir) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  window.dispatchEvent(new Event(NAVEGOU));
  // A new page starts at the top, or at the section the address points to (/#presentes).
  if (!rolar) return;
  if (url.hash) rolarAte(url.hash.slice(1));
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

// The section may still be loading (a microfrontend): try for a few seconds.
function rolarAte(id: string, tentativas = 30) {
  const alvo = document.getElementById(id);
  if (alvo) alvo.scrollIntoView({ block: 'start' });
  else if (tentativas > 0) setTimeout(() => rolarAte(id, tentativas - 1), 100);
}

export function useCaminho(): string {
  return useEndereco().caminho;
}

// The path and the query string (?c=… on the checkout), updated on every navigation.
export function useEndereco(): { caminho: string; busca: URLSearchParams } {
  const [endereco, setEndereco] = useState(() => location.pathname + location.search);
  useEffect(() => {
    const aoMudar = () => setEndereco(location.pathname + location.search);
    window.addEventListener('popstate', aoMudar);
    window.addEventListener(NAVEGOU, aoMudar);
    return () => {
      window.removeEventListener('popstate', aoMudar);
      window.removeEventListener(NAVEGOU, aoMudar);
    };
  }, []);
  const [caminho, busca = ''] = endereco.split('?');
  return { caminho, busca: new URLSearchParams(busca) };
}
