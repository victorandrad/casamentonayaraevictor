import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { EstadoVazio, Icon, SectionHeader } from '@nv/shared';
import { fotos, momentos, type Momento } from './fotos';
import { FotoImagem } from './FotoImagem';
import { Lightbox } from './Lightbox';
import './galeria.css';

// Rhythm of shapes across the grid: tall arch, wide frame, plain frames.
const formas = ['arco', 'normal', 'larga', 'normal', 'arco', 'normal'] as const;

const reduzMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Card leans gently toward the pointer.
function inclinar(e: PointerEvent<HTMLButtonElement>) {
  if (e.pointerType !== 'mouse' || reduzMovimento()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
  el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
  el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`);
  el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`);
}

function endireitar(e: PointerEvent<HTMLButtonElement>) {
  for (const prop of ['--rx', '--ry', '--gx', '--gy']) e.currentTarget.style.removeProperty(prop);
}

export default function Galeria() {
  const [filtro, setFiltro] = useState<Momento | 'todos'>('todos');
  const [aberta, setAberta] = useState<number | null>(null);
  const gatilho = useRef<HTMLElement | null>(null);

  const visiveis = useMemo(() => (filtro === 'todos' ? fotos : fotos.filter((f) => f.momento === filtro)), [filtro]);
  const disponiveis = momentos.filter((m) => m.id === 'todos' || fotos.some((f) => f.momento === m.id));

  return (
    <section id="galeria" className="nv-section nv-section--alt">
      <div className="nv-container--wide">
        <SectionHeader eyebrow="Momentos" title="Nossa história em fotos" />

        {fotos.length === 0 && (
          <EstadoVazio icon="camera" titulo="Em breve, nossas fotos">
            Estamos escolhendo os momentos mais especiais da nossa história para mostrar aqui.
          </EstadoVazio>
        )}

        {disponiveis.length > 2 && (
          <div className="galeria-filtros" role="group" aria-label="Filtrar fotos">
            {disponiveis.map((m) => (
              <button
                key={m.id}
                className={filtro === m.id ? 'galeria-filtro is-active' : 'galeria-filtro'}
                aria-pressed={filtro === m.id}
                onClick={() => setFiltro(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* key restarts the entrance animation when the filter changes */}
        <div className="galeria-grid" key={filtro}>
          {visiveis.map((foto, i) => (
            <button
              key={foto.id}
              className={`galeria-card galeria-card--${filtro === 'todos' ? formas[i % formas.length] : 'normal'}`}
              style={{ animationDelay: `${i * 70}ms` }}
              onPointerMove={inclinar}
              onPointerLeave={endireitar}
              onClick={(e) => {
                gatilho.current = e.currentTarget;
                setAberta(i);
              }}
              aria-label={`Ampliar: ${foto.legenda}`}
            >
              <span className="galeria-card__frame">
                <FotoImagem foto={foto} className="galeria-card__img" />
                <span className="galeria-card__shine" aria-hidden />
                <span className="galeria-card__caption" aria-hidden>
                  <span className="galeria-card__legenda">{foto.legenda}</span>
                  <span className="galeria-card__zoom">
                    <Icon name="expand" size={16} /> Ampliar
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="galeria-note">Em breve, nossas fotos oficiais aqui. Toque em uma foto para ampliar.</p>
      </div>

      {aberta !== null && (
        <Lightbox
          fotos={visiveis}
          indice={aberta}
          onMudar={setAberta}
          onFechar={() => {
            setAberta(null);
            gatilho.current?.focus();
          }}
        />
      )}
    </section>
  );
}
