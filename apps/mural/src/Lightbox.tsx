import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Foto } from './fotos';
import { FotoImagem } from './FotoImagem';

type Props = { fotos: Foto[]; indice: number; onMudar: (i: number) => void; onFechar: () => void };

// Full-screen viewer: arrows, keyboard (← → Esc), swipe and thumbnails.
export function Lightbox({ fotos, indice, onMudar, onFechar }: Props) {
  const [direcao, setDirecao] = useState<'prox' | 'ant'>('prox');
  const fechar = useRef<HTMLButtonElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const foto = fotos[indice];
  const total = fotos.length;

  const ir = (passo: 1 | -1) => {
    setDirecao(passo === 1 ? 'prox' : 'ant');
    onMudar((indice + passo + total) % total);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
      if (e.key === 'ArrowRight') ir(1);
      if (e.key === 'ArrowLeft') ir(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Lock page scroll and move focus into the dialog while it's open.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fechar.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Preload neighbours so next/previous feel instant.
  useEffect(() => {
    for (const passo of [1, -1]) {
      const vizinha = fotos[(indice + passo + total) % total];
      if (vizinha.src) new Image().src = vizinha.src;
    }
  }, [indice, fotos, total]);

  const inicioToque = (e: PointerEvent) => {
    toque.current = { x: e.clientX, y: e.clientY };
  };
  const fimToque = (e: PointerEvent) => {
    if (!toque.current) return;
    const dx = e.clientX - toque.current.x;
    const dy = e.clientY - toque.current.y;
    toque.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) ir(dx < 0 ? 1 : -1);
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Foto: ${foto.legenda}`} onClick={onFechar}>
      <button ref={fechar} className="lightbox__close" onClick={onFechar} aria-label="Fechar">
        ×
      </button>

      <div className="lightbox__stage" onClick={(e) => e.stopPropagation()} onPointerDown={inicioToque} onPointerUp={fimToque}>
        {total > 1 && (
          <button className="lightbox__nav lightbox__nav--prev" onClick={() => ir(-1)} aria-label="Foto anterior">
            ‹
          </button>
        )}

        <figure className={`lightbox__figure lightbox__figure--${direcao}`} key={foto.id}>
          <FotoImagem foto={foto} className="lightbox__img" />
          <figcaption className="lightbox__caption">
            <span className="lightbox__legenda">{foto.legenda}</span>
            <span className="lightbox__count">
              {indice + 1} / {total}
            </span>
          </figcaption>
        </figure>

        {total > 1 && (
          <button className="lightbox__nav lightbox__nav--next" onClick={() => ir(1)} aria-label="Próxima foto">
            ›
          </button>
        )}
      </div>

      {total > 1 && (
        <div className="lightbox__thumbs" onClick={(e) => e.stopPropagation()}>
          {fotos.map((f, i) => (
            <button
              key={f.id}
              className={i === indice ? 'lightbox__thumb is-active' : 'lightbox__thumb'}
              aria-label={`Ver ${f.legenda}`}
              aria-current={i === indice}
              onClick={() => {
                setDirecao(i > indice ? 'prox' : 'ant');
                onMudar(i);
              }}
            >
              <FotoImagem foto={f} className="lightbox__thumb-img" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
