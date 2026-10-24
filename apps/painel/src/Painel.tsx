import { useCallback, useEffect, useState } from 'react';
import { api } from '@nv/shared/api';
import type { Usuario } from '@nv/shared/types';
import { SESSION_EXPIRED_EVENT } from './adminApi';
import { Login } from './Login';
import { Dashboard } from './Dashboard';
import { DefinirSenha, type ModoSenha } from './DefinirSenha';
import './painel.css';

type Estado =
  | { fase: 'verificando' }
  | { fase: 'senha'; token: string; modo: ModoSenha }
  | { fase: 'anonimo'; aviso?: string }
  | { fase: 'logado'; usuario: Usuario };

// Links from the e-mails (the token stays in the hash, so it never reaches server logs):
//   /painel#definir-senha=TOKEN    invite      /painel#redefinir-senha=TOKEN    password recovery
function linkDeSenha(): { token: string; modo: ModoSenha } | null {
  const m = window.location.hash.match(/^#(definir|redefinir)-senha=([A-Za-z0-9_-]{20,100})$/);
  return m ? { token: m[2], modo: m[1] === 'definir' ? 'convite' : 'recuperacao' } : null;
}
const limparHash = () => history.replaceState(null, '', window.location.pathname + window.location.search);

export default function Painel() {
  const [estado, setEstado] = useState<Estado>(() => {
    const link = linkDeSenha();
    return link ? { fase: 'senha', ...link } : { fase: 'verificando' };
  });

  useEffect(() => {
    document.title = 'Painel dos noivos · Nayara & Victor';
    // The panel is private: keep it out of search results (robots.txt also disallows /painel).
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.append(robots);
    if (linkDeSenha()) return;
    api<{ usuario: Usuario }>('/auth/me')
      .then(({ usuario }) => setEstado({ fase: 'logado', usuario }))
      .catch(() => setEstado({ fase: 'anonimo' }));

    const expirou = () => setEstado({ fase: 'anonimo', aviso: 'Sua sessão expirou. Entre novamente.' });
    window.addEventListener(SESSION_EXPIRED_EVENT, expirou);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expirou);
      robots.remove();
    };
  }, []);

  const sair = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setEstado({ fase: 'anonimo' });
  }, []);

  if (estado.fase === 'verificando') return <div className="painel-loading">Carregando…</div>;
  if (estado.fase === 'senha') {
    return (
      <DefinirSenha
        token={estado.token}
        modo={estado.modo}
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
