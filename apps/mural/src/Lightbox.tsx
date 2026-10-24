import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Foto } from './fotos';
import { FotoImagem } from './FotoImagem';

type Props = { fotos: Foto[]; indice: number; onMudar: (i: number) => void; onFechar: () => void };

const VIRAR_MS = 900;
const umaPagina = () => matchMedia('(max-width: 720px)').matches;

// One page of the open album: the photo mounted with corner mounts, its handwritten caption and the
// page number. Past the last photo the page is left blank, with a small ornament.
function Pagina({ foto, numero, lado }: { foto?: Foto; numero: number; lado: 'esq' | 'dir' }) {
  return (
    <div className={`livro-pagina livro-pagina--${lado}`}>
      {foto ? (
        <>
          <span className="livro-pagina__foto">
            <FotoImagem foto={foto} className="livro-pagina__img" />
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <span key={c} className={`album-canto album-canto--${c}`} aria-hidden />
            ))}
          </span>
          <span className="livro-pagina__legenda">{foto.legenda}</span>
        </>
      ) : (
        <span className="livro-pagina__fim" aria-hidden>
          ❦
        </span>
      )}
      <span className="livro-pagina__numero" aria-hidden>
        {numero}
      </span>
    </div>
  );
}

type Virada = { para: number; sentido: 'prox' | 'ant' };

// Full-screen viewer shaped like an open retro photo album: one photo per page, two pages per spread
// (one on phones), and the pages turn over the spine. Arrows, keyboard (← → Esc) and swipe.
export function Lightbox({ fotos, indice, onMudar, onFechar }: Props) {
  const [porVez, setPorVez] = useState(() => (umaPagina() ? 1 : 2));
  const [abertura, setAbertura] = useState(() => Math.floor(indice / porVez));
  const [virada, setVirada] = useState<Virada | null>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const total = fotos.length;
  const aberturas = Math.ceil(total / porVez);

  const ir = (passo: 1 | -1) => {
    if (virada) return;
    const para = abertura + passo;
    if (para < 0 || para >= aberturas) return;
    setVirada({ para, sentido: passo === 1 ? 'prox' : 'ant' });
  };

  // When the page has turned, the new spread becomes the current one.
  useEffect(() => {
    if (!virada) return;
    const t = window.setTimeout(() => {
      setAbertura(virada.para);
      onMudar(virada.para * porVez);
      setVirada(null);
    }, VIRAR_MS);
    return () => window.clearTimeout(t);
  }, [virada, porVez, onMudar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
      if (e.key === 'ArrowRight') ir(1);
      if (e.key === 'ArrowLeft') ir(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // One or two pages per spread, following the screen; keeps the same photos in view.
  useEffect(() => {
    const atualizar = () => {
      const n = umaPagina() ? 1 : 2;
      if (n === porVez) return;
      setAbertura((a) => Math.floor((a * porVez) / n));
      setPorVez(n);
    };
    window.addEventListener('resize', atualizar);
    return () => window.removeEventListener('resize', atualizar);
  }, [porVez]);

  // Lock page scroll and move focus into the dialog while it's open.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fechar.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Preload the neighbouring spreads so the pages turn without waiting for images.
  useEffect(() => {
    for (const a of [abertura - 1, abertura + 1]) {
      for (let k = 0; k < porVez; k++) {
        const src = fotos[a * porVez + k]?.src;
        if (src) new Image().src = src;
      }
    }
  }, [abertura, porVez, fotos]);

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

  const pagina = (n: number, lado: 'esq' | 'dir') => <Pagina key={`${lado}-${n}`} foto={fotos[n]} numero={n + 1} lado={lado} />;
  const primeira = abertura * porVez;

  // What lies under the turning leaf, and the leaf itself (front and back).
  let baixo: ReactNode;
  let folha: ReactNode = null;
  if (porVez === 2) {
    if (virada?.sentido === 'prox') {
      const p = virada.para * 2;
      baixo = [pagina(primeira, 'esq'), pagina(p + 1, 'dir')];
      folha = (
        <div className="livro-folha livro-folha--prox">
          <div className="livro-folha__face">{pagina(primeira + 1, 'dir')}</div>
          <div className="livro-folha__face livro-folha__face--verso">{pagina(p, 'esq')}</div>
        </div>
      );
    } else if (virada?.sentido === 'ant') {
      const p = virada.para * 2;
      baixo = [pagina(p, 'esq'), pagina(primeira + 1, 'dir')];
      folha = (
        <div className="livro-folha livro-folha--ant">
          <div className="livro-folha__face">{pagina(primeira, 'esq')}</div>
          <div className="livro-folha__face livro-folha__face--verso">{pagina(p + 1, 'dir')}</div>
        </div>
      );
    } else {
      baixo = [pagina(primeira, 'esq'), pagina(primeira + 1, 'dir')];
    }
  } else if (virada?.sentido === 'prox') {
    baixo = pagina(virada.para, 'dir');
    folha = (
      <div className="livro-folha livro-folha--prox livro-folha--sai">
        <div className="livro-folha__face">{pagina(primeira, 'dir')}</div>
        <div className="livro-folha__face livro-folha__face--verso livro-folha__face--liso" />
      </div>
    );
  } else if (virada?.sentido === 'ant') {
    baixo = pagina(primeira, 'dir');
    folha = (
      <div className="livro-folha livro-folha--volta">
        <div className="livro-folha__face">{pagina(virada.para, 'dir')}</div>
        <div className="livro-folha__face livro-folha__face--verso livro-folha__face--liso" />
      </div>
    );
  } else {
    baixo = pagina(primeira, 'dir');
  }

  const ultima = Math.min(primeira + porVez, total);
  const contagem = porVez === 2 && ultima - primeira > 1 ? `${primeira + 1}–${ultima} de ${total}` : `${primeira + 1} de ${total}`;
  const atual = fotos[primeira];

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Álbum de fotos: ${atual?.legenda || 'Nayara e Victor'}`} onClick={onFechar}>
      <button ref={fechar} className="lightbox__close" onClick={onFechar} aria-label="Fechar">
        ×
      </button>

      <div className="lightbox__stage" onClick={(e) => e.stopPropagation()} onPointerDown={inicioToque} onPointerUp={fimToque}>
        {aberturas > 1 && (
          <button className="lightbox__nav lightbox__nav--prev" onClick={() => ir(-1)} disabled={abertura === 0} aria-label="Página anterior">
            ‹
          </button>
        )}

        <div className={`livro ${porVez === 2 ? 'livro--duplo' : 'livro--simples'}`}>
          <div className="livro__miolo">
            {baixo}
            {folha}
          </div>
        </div>

        {aberturas > 1 && (
          <button className="lightbox__nav lightbox__nav--next" onClick={() => ir(1)} disabled={abertura === aberturas - 1} aria-label="Próxima página">
            ›
          </button>
        )}
      </div>

      <p className="lightbox__count" aria-live="polite">
        {contagem}
      </p>
    </div>
  );
}
