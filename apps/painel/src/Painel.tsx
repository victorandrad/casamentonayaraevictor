import { useCallback, useEffect, useState } from 'react';
import { api } from '@nv/shared/api';
import type { Usuario } from '@nv/shared/types';
import { SESSION_EXPIRED_EVENT } from './adminApi';
import { Login } from './Login';
import { Dashboard } from './Dashboard';
import { DefinirSenha } from './DefinirSenha';
import './painel.css';

type Estado =
  | { fase: 'verificando' }
  | { fase: 'convite'; token: string }
  | { fase: 'anonimo'; aviso?: string }
  | { fase: 'logado'; usuario: Usuario };

// Invite link from the e-mail: /painel#definir-senha=TOKEN (the token never goes to server logs).
const tokenDoConvite = () => window.location.hash.match(/^#definir-senha=([A-Za-z0-9_-]{20,100})$/)?.[1] ?? null;
const limparHash = () => history.replaceState(null, '', window.location.pathname + window.location.search);

export default function Painel() {
  const [estado, setEstado] = useState<Estado>(() => {
    const token = tokenDoConvite();
    return token ? { fase: 'convite', token } : { fase: 'verificando' };
  });

  useEffect(() => {
    document.title = 'Painel dos noivos · Nayara & Victor';
    if (tokenDoConvite()) return;
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
  if (estado.fase === 'convite') {
    return (
      <DefinirSenha
        token={estado.token}
        onEntrar={(usuario) => {
          limparHash();
          setEstado({ fase: 'logado', usuario });
        }}
        onCancelar={() => {
          limparHash();
          setEstado({ fase: 'anonimo' });
        }}
      />
    );
  }
  if (estado.fase === 'anonimo') {
    return <Login aviso={estado.aviso} onEntrar={(usuario) => setEstado({ fase: 'logado', usuario })} />;
  }
  return <Dashboard usuario={estado.usuario} onSair={sair} onUsuario={(usuario) => setEstado({ fase: 'logado', usuario })} />;
}
