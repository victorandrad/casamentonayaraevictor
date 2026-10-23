import { useEffect, useRef, useState } from 'react';

const links = [
  ['#evento', 'Evento'],
  ['#presentes', 'Presentes'],
  ['#galeria', 'Galeria'],
  ['#recados', 'Recados'],
  ['#local', 'Local'],
] as const;

export function Nav() {
  const [aberto, setAberto] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  // Close the mobile menu on Esc, outside tap, or when growing back to desktop.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    const onClickFora = (e: PointerEvent) => {
      if (!nav.current?.contains(e.target as Node)) setAberto(false);
    };
    const desktop = matchMedia('(min-width: 861px)');
    const onResize = () => desktop.matches && setAberto(false);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onClickFora);
    desktop.addEventListener('change', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onClickFora);
      desktop.removeEventListener('change', onResize);
    };
  }, [aberto]);

  const fechar = () => setAberto(false);

  return (
    <nav ref={nav} className={aberto ? 'shell-nav is-open' : 'shell-nav'} aria-label="Menu principal">
      <a href="#convite" className="shell-nav__brand" aria-label="Início" onClick={fechar}>
        N <span>&amp;</span> V
      </a>

      <div className="shell-nav__links">
        {links.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </div>

      <div className="shell-nav__actions">
        <a href="#presenca" className="shell-nav__cta" onClick={fechar}>
          Confirmar presença
        </a>
        <button
          ref={botao}
          className="shell-nav__toggle"
          aria-expanded={aberto}
          aria-controls="menu-mobile"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setAberto((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div id="menu-mobile" className="shell-nav__panel" hidden={!aberto}>
        {links.map(([href, label], i) => (
          <a key={href} href={href} onClick={fechar} style={{ animationDelay: `${i * 45}ms` }}>
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
