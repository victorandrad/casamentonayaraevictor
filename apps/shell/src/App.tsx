import { lazy, useEffect, useState } from 'react';
import { RemoteSlot } from './RemoteSlot';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Countdown } from './components/Countdown';
import { Verse } from './components/Verse';
import { Petals } from './components/Petals';
import { Footer } from './components/Footer';
import { MapaMaroto } from './components/MapaMaroto';

const Evento = lazy(() => import('evento/Evento'));
const Traje = lazy(() => import('evento/Traje'));
const Local = lazy(() => import('evento/Local'));
const Rsvp = lazy(() => import('rsvp/Rsvp'));
const Portaria = lazy(() => import('rsvp/Portaria'));
const Presentes = lazy(() => import('presentes/Presentes'));
const Galeria = lazy(() => import('mural/Galeria'));
const Recados = lazy(() => import('mural/Recados'));
const Painel = lazy(() => import('painel/Painel'));

const MAPA_VISTO = 'nv_mapa_visto';

// The map opening shows on the first visit to the home page only: not for links that go straight to
// something (invite, check-in, a section, the return from payment). #mapa forces it.
function mostrarMapa(): boolean {
  if (location.hash === '#mapa') return true;
  if (location.hash || new URLSearchParams(location.search).has('pedido')) return false;
  try {
    return localStorage.getItem(MAPA_VISTO) !== '1';
  } catch {
    return false;
  }
}

export function App() {
  const [mapa, setMapa] = useState(mostrarMapa);

  // A link to #mapa while the site is open plays the opening again.
  useEffect(() => {
    const aoMudar = () => {
      if (location.hash === '#mapa') {
        window.scrollTo({ top: 0, behavior: 'instant' });
        setMapa(true);
      }
    };
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  // The couple's panel lives at /painel and replaces the public site.
  if (location.pathname.replace(/\/+$/, '') === '/painel') {
    return <RemoteSlot name="painel/Painel" component={Painel} />;
  }

  const fecharMapa = () => {
    try {
      localStorage.setItem(MAPA_VISTO, '1');
    } catch {
      // storage blocked: it just shows again next time
    }
    if (location.hash === '#mapa') history.replaceState(null, '', location.pathname + location.search);
    setMapa(false);
  };

  const reverMapa = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setMapa(true);
  };

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Countdown />
        <Verse />
        <RemoteSlot name="evento/Evento" component={Evento} />
        <RemoteSlot name="rsvp/Rsvp" component={Rsvp} />
        <RemoteSlot name="presentes/Presentes" component={Presentes} />
        <RemoteSlot name="mural/Galeria" component={Galeria} />
        <RemoteSlot name="evento/Traje" component={Traje} />
        <RemoteSlot name="mural/Recados" component={Recados} />
        <RemoteSlot name="evento/Local" component={Local} />
      </main>
      <Footer onReverMapa={reverMapa} />
      <Petals />
      <RemoteSlot name="rsvp/Portaria" component={Portaria} />
      {mapa && <MapaMaroto onFim={fecharMapa} />}
    </>
  );
}
