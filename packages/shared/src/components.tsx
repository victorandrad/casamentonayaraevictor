import type { ReactNode } from 'react';
import { Icon, Ornament, type IconName } from './ornaments';

export function SectionHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="nv-section-header">
      <p className="nv-script-eyebrow">{eyebrow}</p>
      <h2 className="nv-title">{title}</h2>
      <Ornament className="nv-ornament" />
      {children}
    </div>
  );
}

export function MapsLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="nv-btn-outline" href={href} target="_blank" rel="noopener">
      <Icon name="pin" size={15} /> {children}
    </a>
  );
}

export function Placeholder({ label, className = '' }: { label: string; className?: string }) {
  return <div className={`nv-placeholder ${className}`}>{label}</div>;
}

// Empty-list message: soft icon, a short title, an explanation and an optional
// action (e.g. "create the first one" or "clear filters").
export function EstadoVazio({
  icon = 'heart',
  titulo,
  children,
  acao,
  compacto,
}: {
  icon?: IconName;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
  compacto?: boolean;
}) {
  return (
    <div className={compacto ? 'nv-vazio nv-vazio--compacto' : 'nv-vazio'} role="status">
      <span className="nv-vazio__icone">
        <Icon name={icon} size={compacto ? 22 : 30} />
      </span>
      <p className="nv-vazio__titulo">{titulo}</p>
      {children && <p className="nv-vazio__texto">{children}</p>}
      {acao && <div className="nv-vazio__acao">{acao}</div>}
    </div>
  );
}
