import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { EstadoVazio, Icon, SectionHeader } from '@nv/shared';
import { carregarFotos, momentos, type Foto, type Momento } from './fotos';
import { FotoImagem } from './FotoImagem';
import { Lightbox } from './Lightbox';
import './galeria.css';

// Every card is the same square, so the grid has no gaps whatever the photos. Photos are shown a page
// at a time: full rows for the number of columns the screen has (same breakpoints as galeria.css),
// two rows, or three on phones.
const colunas = () => (matchMedia('(max-width: 560px)').matches ? 2 : matchMedia('(max-width: 900px)').matches ? 3 : 4);

function usePorPagina() {
  const porPagina = () => (colunas() === 2 ? 6 : colunas() * 2);
  const [n, setN] = useState(porPagina);
  useEffect(() => {
    const atualizar = () => setN(porPagina());
    window.addEventListener('resize', atualizar);
    return () => window.removeEventListener('resize', atualizar);
  }, []);
  return n;
}

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
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [filtro, setFiltro] = useState<Momento | 'todos'>('todos');
  const [aberta, setAberta] = useState<number | null>(null);
  const [pagina, setPagina] = useState(0);
  const POR_PAGINA = usePorPagina();
  const gatilho = useRef<HTMLElement | null>(null);
  const topo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    carregarFotos()
      .then(setFotos)
      .catch(() => setFotos([]));
  }, []);

  const lista = useMemo(() => fotos ?? [], [fotos]);
  const visiveis = useMemo(() => (filtro === 'todos' ? lista : lista.filter((f) => f.momento === filtro)), [filtro, lista]);
  const disponiveis = momentos.filter((m) => m.id === 'todos' || lista.some((f) => f.momento === m.id));
  const paginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas - 1);
  const daPagina = visiveis.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA);

  const irPara = (p: number) => {
    setPagina(p);
    // keep the grid in view when the page changes from the controls below it
    const r = topo.current?.getBoundingClientRect();
    if (r && r.top < 0) topo.current?.scrollIntoView({ behavior: reduzMovimento() ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section id="galeria" className="nv-section nv-section--alt">
      <div className="nv-container--wide">
        <SectionHeader eyebrow="Momentos" title="Nossa história em fotos" />

        {fotos?.length === 0 && (
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
                onClick={() => {
                  setFiltro(m.id);
                  setPagina(0);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* key restarts the entrance animation when the filter or the page changes */}
        <div className="galeria-grid" key={`${filtro}-${atual}`} ref={topo}>
          {daPagina.map((foto, i) => (
            <button
              key={foto.id}
              className="galeria-card"
              style={{ animationDelay: `${i * 70}ms` }}
              onPointerMove={inclinar}
              onPointerLeave={endireitar}
              onClick={(e) => {
                gatilho.current = e.currentTarget;
                setAberta(atual * POR_PAGINA + i);
              }}
              aria-label={`Ampliar: ${foto.legenda || 'foto'}`}
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

        {paginas > 1 && (
          <nav className="galeria-paginas" aria-label="Páginas da galeria">
            <button className="galeria-pagina galeria-pagina--seta" onClick={() => irPara(atual - 1)} disabled={atual === 0} aria-label="Página anterior">
              ‹
            </button>
            {Array.from({ length: paginas }, (_, p) => (
              <button
                key={p}
                className={p === atual ? 'galeria-pagina is-active' : 'galeria-pagina'}
                onClick={() => irPara(p)}
                aria-label={`Página ${p + 1}`}
                aria-current={p === atual ? 'page' : undefined}
              >
                {p + 1}
              </button>
            ))}
            <button className="galeria-pagina galeria-pagina--seta" onClick={() => irPara(atual + 1)} disabled={atual === paginas - 1} aria-label="Próxima página">
              ›
            </button>
          </nav>
        )}

        {lista.length > 0 && <p className="galeria-note">Toque em uma foto para ampliar.</p>}
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
