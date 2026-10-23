import { useState } from 'react';
import { Icon, type IconName } from '@nv/shared';
import type { Usuario } from '@nv/shared/types';
import { Resumo } from './abas/Resumo';
import { Convidados } from './abas/Convidados';
import { Recados } from './abas/Recados';
import { Presentes } from './abas/Presentes';
import { Recebidos } from './abas/Recebidos';
import { Configuracoes } from './abas/Configuracoes';
import { Emails } from './abas/Emails';
import { Galeria } from './abas/Galeria';
import { Conta } from './abas/Conta';

const abas = [
  { id: 'resumo', label: 'Resumo', icon: 'heart' },
  { id: 'convidados', label: 'Convidados', icon: 'envelope' },
  { id: 'recados', label: 'Recados', icon: 'rings' },
  { id: 'recebidos', label: 'Recebidos', icon: 'gift' },
  { id: 'presentes', label: 'Lista de presentes', icon: 'home' },
  { id: 'galeria', label: 'Galeria', icon: 'camera' },
  { id: 'emails', label: 'E-mails', icon: 'envelope' },
  { id: 'configuracoes', label: 'Configurações', icon: 'calendar' },
  { id: 'conta', label: 'Minha conta', icon: 'lock' },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: IconName }>;

type AbaId = (typeof abas)[number]['id'];

export function Dashboard({ usuario, onSair, onUsuario }: { usuario: Usuario; onSair: () => void; onUsuario: (u: Usuario) => void }) {
  const [aba, setAba] = useState<AbaId>('resumo');

  return (
    <div className="painel">
      <header className="painel-header">
        <div className="painel-header__brand">
          <span className="painel-header__monogram">
            N<em>&amp;</em>V
          </span>
          <span className="painel-header__title">Painel dos noivos</span>
        </div>
        <div className="painel-header__actions">
          <button className="painel-header__user painel-header__user--link" onClick={() => setAba('conta')} title="Minha conta">
            Olá, {usuario.nome}
          </button>
          <a className="nv-btn-outline" href="/" target="_blank" rel="noopener">
            Ver site
          </a>
          <button className="nv-btn-ghost" onClick={onSair}>
            Sair
          </button>
        </div>
      </header>

      <nav className="painel-tabs" aria-label="Seções do painel">
        {abas.map((a) => (
          <button
            key={a.id}
            className={a.id === aba ? 'painel-tab is-active' : 'painel-tab'}
            aria-current={a.id === aba ? 'page' : undefined}
            onClick={() => setAba(a.id)}
          >
            <Icon name={a.icon} size={18} />
            {a.label}
          </button>
        ))}
      </nav>

      <main className="painel-main">
        {aba === 'resumo' && <Resumo onIr={setAba} />}
        {aba === 'convidados' && <Convidados />}
        {aba === 'recados' && <Recados />}
        {aba === 'recebidos' && <Recebidos />}
        {aba === 'presentes' && <Presentes />}
        {aba === 'galeria' && <Galeria />}
        {aba === 'emails' && <Emails />}
        {aba === 'configuracoes' && <Configuracoes usuario={usuario} />}
        {aba === 'conta' && <Conta usuario={usuario} onUsuario={onUsuario} />}
      </main>
    </div>
  );
}
