import { useCallback, useEffect, useState } from 'react';
import { api } from '@nv/shared/api';
import type { Usuario } from '@nv/shared/types';
import { SESSION_EXPIRED_EVENT } from './adminApi';
import { Login } from './Login';
import { Dashboard } from './Dashboard';
import './painel.css';

type Estado = { fase: 'verificando' } | { fase: 'anonimo'; aviso?: string } | { fase: 'logado'; usuario: Usuario };

export default function Painel() {
  const [estado, setEstado] = useState<Estado>({ fase: 'verificando' });

  useEffect(() => {
    document.title = 'Painel dos noivos · Nayara & Victor';
    api<{ usuario: Usuario }>('/auth/me')
      .then(({ usuario }) => setEstado({ fase: 'logado', usuario }))
      .catch(() => setEstado({ fase: 'anonimo' }));

    const expirou = () => setEstado({ fase: 'anonimo', aviso: 'Sua sessão expirou. Entre novamente.' });
    window.addEventListener(SESSION_EXPIRED_EVENT, expirou);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expirou);
  }, []);

  const sair = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setEstado({ fase: 'anonimo' });
  }, []);

  if (estado.fase === 'verificando') return <div className="painel-loading">Carregando…</div>;
  if (estado.fase === 'anonimo') {
    return <Login aviso={estado.aviso} onEntrar={(usuario) => setEstado({ fase: 'logado', usuario })} />;
  }
  return <Dashboard usuario={estado.usuario} onSair={sair} />;
}
