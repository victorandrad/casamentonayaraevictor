import { useEffect, useState } from 'react';
import { Icon } from '@nv/shared';
import type { Checkin } from '@nv/shared/types';
import { consultarCheckin, hashParam } from './storage';
import { Scanner } from './Scanner';
import './rsvp.css';

// Door-staff overlays driven by the URL hash:
//   #checkin=CODE  → shown when a guest's QR Code is opened
//   #scanner       → camera reader for the entrance
type Mode = { kind: 'checkin'; code: string } | { kind: 'scanner' } | null;
type Lookup = { state: 'loading' } | { state: 'found'; checkin: Checkin } | { state: 'missing' };

function modeFromHash(): Mode {
  const code = hashParam('checkin');
  if (code) return { kind: 'checkin', code };
  if (/scanner/.test(location.hash)) return { kind: 'scanner' };
  return null;
}

const checkinView = {
  sim: { icon: '✓', title: 'Presença validada' },
  nao: { icon: '✕', title: 'Convite marcado como ausente' },
  pendente: { icon: '⏳', title: 'Convite válido · ainda sem confirmação' },
};

export default function Portaria() {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  const [lookup, setLookup] = useState<Lookup>({ state: 'loading' });

  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const code = mode?.kind === 'checkin' ? mode.code : null;
  useEffect(() => {
    if (!code) return;
    let active = true;
    setLookup({ state: 'loading' });
    consultarCheckin(code)
      .then((checkin) => active && setLookup({ state: 'found', checkin }))
      .catch(() => active && setLookup({ state: 'missing' }));
    return () => {
      active = false;
    };
  }, [code]);

  const close = () => {
    history.replaceState(null, '', location.pathname + location.search);
    setMode(null);
  };

  if (!mode) return null;
  if (mode.kind === 'scanner') return <Scanner onClose={close} />;

  return (
    <div className="portaria">
      <div className="portaria__box nv-fade-up">
        <p className="portaria__kicker">Check-in · Nayara &amp; Victor</p>
        {lookup.state === 'loading' && <h3 className="portaria__title">Verificando convite…</h3>}
        {lookup.state === 'found' && (
          <>
            <div className="portaria__icon">{checkinView[lookup.checkin.status].icon}</div>
            <h3 className="portaria__title">{checkinView[lookup.checkin.status].title}</h3>
            <p className="portaria__name">{lookup.checkin.nome}</p>
            {lookup.checkin.status === 'sim' && lookup.checkin.acompanhantes > 0 && (
              <p className="portaria__text">+{lookup.checkin.acompanhantes} acompanhante(s)</p>
            )}
          </>
        )}
        {lookup.state === 'missing' && (
          <>
            <div className="portaria__icon">
              <Icon name="envelope" size={56} />
            </div>
            <h3 className="portaria__title">Convite não encontrado</h3>
            <p className="portaria__text">Este código não está na lista de convidados. Confira com os noivos.</p>
          </>
        )}
        <p className="portaria__code">{mode.code}</p>
        <button className="portaria__btn" onClick={close}>
          Fechar
        </button>
      </div>
    </div>
  );
}
