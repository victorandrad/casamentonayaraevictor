import { lazy } from 'react';
import { RemoteSlot } from './RemoteSlot';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Countdown } from './components/Countdown';
import { Verse } from './components/Verse';
import { Petals } from './components/Petals';
import { Footer } from './components/Footer';

const Evento = lazy(() => import('evento/Evento'));
const Traje = lazy(() => import('evento/Traje'));
const Local = lazy(() => import('evento/Local'));
const Rsvp = lazy(() => import('rsvp/Rsvp'));
const Portaria = lazy(() => import('rsvp/Portaria'));
const Presentes = lazy(() => import('presentes/Presentes'));
const Galeria = lazy(() => import('mural/Galeria'));
const Recados = lazy(() => import('mural/Recados'));
const Painel = lazy(() => import('painel/Painel'));

export function App() {
  // The couple's panel lives at /painel and replaces the public site.
  if (location.pathname.replace(/\/+$/, '') === '/painel') {
    return <RemoteSlot name="painel/Painel" component={Painel} />;
  }

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
      <Footer />
      <Petals />
      <RemoteSlot name="rsvp/Portaria" component={Portaria} />
    </>
  );
}
