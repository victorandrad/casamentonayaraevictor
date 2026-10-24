import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CapaMapa } from './CapaMapa';
import { JURAMENTO, Varinha } from './Varinha';
import { caixa, ENCONTRO, para, PlantaMapa, TRILHAS, VersoMapa, type Orientacao, type P } from './PlantaMapa';
import { somDePapel, somDePassos, type Som } from './mapaSom';
import './mapa.css';

// Opening of the site in the style of the Marauder's Map (an homage with original art): the folded
// map shows its cover, printed on the backs of its two end flaps that meet down the middle; with a
// tap both sides "un-accordion" at once, swinging out from the central panel in a zigzag, footprints
// walk the corridors with their names, "Com muito amor esse dia será feito." wipes the ink and the site appears.
type Fase = 'fechado' | 'capa' | 'desdobrando' | 'mapa' | 'malfeito' | 'saindo';
type Lado = 'raiz' | 'esq' | 'dir';

// Accordion flaps on each side of the central panel. An odd number puts the back of the outermost
// flap (where the cover is printed) on top of each folded stack.
const ABAS = { horizontal: 5, vertical: 1 } as const;
// desdobrar: the tap's spark before the paper moves; dobra: the accordion's opening (same as the CSS).
const T = { desdobrar: 150, dobra: 2400, andar: 2800, malfeito: 7000, sair: 9300, fim: 10700 };
const PASSO = 110;

// The accordion runs left/right; the central panel is twice as wide as a flap, so each folded stack
// covers one half of it and the two stacks meet in the middle.
type Medidas = { o: Orientacao; k: number; W: number; H: number; ps: number; pc: number };

function medir(): Medidas {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const o: Orientacao = vw / vh < 0.8 ? 'vertical' : 'horizontal';
  const k = ABAS[o];
  const W = o === 'horizontal' ? Math.min(vw * 0.9, 1320, vh * 0.8 * 2.6) : Math.min(vw * 0.92, 560, vh * 0.82 * 0.62);
  const H = o === 'horizontal' ? W / 2.6 : W / 0.62;
  const ps = W / (2 * k + 2);
  return { o, k, W, H, ps, pc: 2 * ps };
}

// One panel of the leaflet with its slice of the drawing (and of the footprints, so they stay on the
// paper when the open map keeps its creases). `j` counts flaps outwards from the central panel; a flap
// hangs from the outer edge of the previous one and, folded, lies over it. Its back shows the front's
// ink bleeding through, mirrored, and lines of Latin; the outermost flaps carry the cover instead.
function Dobra({ j, lado, m, pegadas, children }: { j: number; lado: Lado; m: Medidas; pegadas: boolean; children?: ReactNode }) {
  const { w, h } = caixa(m.o);
  const x0 = lado === 'raiz' ? m.k * m.ps : lado === 'esq' ? (m.k - j) * m.ps : m.k * m.ps + m.pc + (j - 1) * m.ps;
  const largura = lado === 'raiz' ? m.pc : m.ps;
  const fatia: CSSProperties = { width: m.W, height: m.H, left: -x0, top: 0 };
  const id = `${lado}-${j}`;
  const capa = lado !== 'raiz' && j === m.k;
  return (
    <div
      className={`mapa__dobra mapa__dobra--${lado} ${j % 2 ? 'mapa__dobra--impar' : 'mapa__dobra--par'}`}
      style={{ width: largura, ...(lado === 'raiz' ? { left: x0 } : {}) }}
    >
      <div className="mapa__face mapa__face--dentro">
        <svg className="mapa__fatia" viewBox={`0 0 ${w} ${h}`} style={fatia} aria-hidden>
          <PlantaMapa orientacao={m.o} id={`mapa-dobra-${id}`} />
        </svg>
        {pegadas && <Pegadas o={m.o} estilo={fatia} id={id} />}
      </div>
      <div className="mapa__face mapa__face--fora">
        {capa ? (
          // Folded, the left stack shows the cover's left half and the right stack its right half.
          <div className="mapa__capa-metade" style={{ width: m.pc, left: lado === 'esq' ? 0 : -m.ps }}>
            <CapaMapa />
          </div>
        ) : (
          <>
            <div className="mapa__verso-tinta">
              <svg className="mapa__fatia" viewBox={`0 0 ${w} ${h}`} style={fatia} aria-hidden>
                <PlantaMapa orientacao={m.o} id={`mapa-verso-${id}`} />
              </svg>
            </div>
            <VersoMapa largura={largura} altura={m.H} indice={x0 / m.ps} />
          </>
        )}
      </div>
      {children}
    </div>
  );
}

function cadeia(m: Medidas, lado: 'esq' | 'dir', pegadas: boolean) {
  let filho: ReactNode = null;
  for (let j = m.k; j >= 1; j--) {
    filho = (
      <Dobra j={j} lado={lado} m={m} pegadas={pegadas}>
        {filho}
      </Dobra>
    );
  }
  return filho;
}

// The central panel with an accordion of flaps on each side.
function Sanfona({ m, pegadas }: { m: Medidas; pegadas: boolean }) {
  return (
    <Dobra j={0} lado="raiz" m={m} pegadas={pegadas}>
      {cadeia(m, 'esq', pegadas)}
      {cadeia(m, 'dir', pegadas)}
    </Dobra>
  );
}

type Pegada = { x: number; y: number; angulo: number; atraso: number };

// Footprints along a corridor path, alternating left and right of it.
function pegadasDe(o: Orientacao, pontos: P[], inicio: number) {
  const pts = pontos.map((p) => para(o, p));
  const segmentos = pts.slice(1).map((b, k) => {
    const a = pts[k];
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const total = segmentos.reduce((s, g) => s + g.len, 0);
  const passos = Math.max(8, Math.min(18, Math.round(total / (caixa(o).h * 0.045))));
  const pegadas: Pegada[] = [];
  for (let k = 0; k < passos; k++) {
    let d = (k / (passos - 1)) * total;
    let seg = segmentos[segmentos.length - 1];
    for (const g of segmentos) {
      if (d <= g.len) {
        seg = g;
        break;
      }
      d -= g.len;
    }
    const t = seg.len ? Math.min(1, d / seg.len) : 0;
    const dx = seg.b[0] - seg.a[0];
    const dy = seg.b[1] - seg.a[1];
    const len = Math.hypot(dx, dy) || 1;
    const lado = k % 2 ? 1 : -1;
    pegadas.push({
      x: seg.a[0] + dx * t + (-dy / len) * 9 * lado,
      y: seg.a[1] + dy * t + (dx / len) * 9 * lado,
      angulo: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
      atraso: inicio + k * PASSO,
    });
  }
  return { pegadas, fim: pts[pts.length - 1] };
}

// A name on a little curved ribbon with forked ends, like the labels of the Marauder's Map. It walks
// along with its footprints (SMIL, timed from when the footprints mount) and stops where they end.
function FitaNome(props: { id: string; nome: string; fonte: number; caminho: string; inicio: number; dur: number; sumir?: number; surgir?: boolean }) {
  const { id, nome, fonte, caminho, inicio, dur, sumir, surgir } = props;
  const w = nome.length * fonte * 0.5 + fonte * 1.4;
  const arco = fonte * 0.55;
  const curva = (dy: number, recuo = 0) => `M${(-w / 2 + recuo).toFixed(1)} ${dy.toFixed(1)} Q0 ${(dy - arco * 2).toFixed(1)} ${(w / 2 - recuo).toFixed(1)} ${dy.toFixed(1)}`;
  const a = fonte * 0.62; // half the band's height
  // forked tail tucked behind each end
  const ponta = (lado: 1 | -1) => {
    const x = (lado * w) / 2;
    return `M${x} ${-a * 0.7} L${x + lado * fonte * 0.9} ${-a * 0.55} L${x + lado * fonte * 0.5} ${a * 0.35} L${x + lado * fonte * 0.95} ${a * 1.25} L${x} ${a * 1.05} Z`;
  };
  return (
    <g className="mapa__fita" opacity="0">
      <set attributeName="opacity" to="1" begin={`${inicio}ms`} fill="freeze" />
      {sumir !== undefined && <animate attributeName="opacity" to="0" begin={`${sumir}ms`} dur="400ms" fill="freeze" />}
      <animateMotion path={caminho} begin={`${inicio}ms`} dur={`${Math.max(1, dur)}ms`} calcMode="paced" fill="freeze" />
      {surgir && <animateTransform attributeName="transform" type="scale" from="0.2" to="1" begin={`${inicio}ms`} dur="500ms" fill="freeze" />}
      <path className="mapa__fita-ponta" d={ponta(-1)} />
      <path className="mapa__fita-ponta" d={ponta(1)} />
      <path className="mapa__fita-borda" d={curva(0)} strokeWidth={a * 2 + 3} />
      <path className="mapa__fita-papel" d={curva(0)} strokeWidth={a * 2} />
      <path id={`fita-${id}`} d={curva(fonte * 0.32, fonte * 0.3)} fill="none" />
      <text fontSize={fonte}>
        <textPath href={`#fita-${id}`} startOffset="50%" textAnchor="middle">
          {nome}
        </textPath>
      </text>
    </g>
  );
}

function Pegadas({ o, estilo, id }: { o: Orientacao; estilo: CSSProperties; id: string }) {
  const { w, h } = caixa(o);
  const escala = o === 'horizontal' ? 2.2 : 2.5;
  const fonte = o === 'horizontal' ? 30 : 34;
  const trilhas = useMemo(() => TRILHAS.map((t) => ({ t, ...pegadasDe(o, t.pontos, t.inicio) })), [o]);
  const encontro = Math.max(...trilhas.filter((x) => x.t.casal).map((x) => x.pegadas[x.pegadas.length - 1].atraso)) + 250;
  const [cx, cy] = para(o, ENCONTRO);
  const casal = TRILHAS.filter((x) => x.casal).map((x) => x.nome).join(' & ');
  const fc = o === 'horizontal' ? fonte : fonte * 0.8; // couple's ribbon: narrower room in portrait
  const afasta = fonte * 1.5; // distance between a ribbon and its footprints

  return (
    <svg className="mapa__pegadas" viewBox={`0 0 ${w} ${h}`} style={estilo} aria-hidden>
      {trilhas.map(({ t, pegadas, fim }, n) => {
        // above the footprints, or below them when the trail ends near the top (rooms up there)
        const dy = fim[1] < h / 2 ? afasta : -afasta;
        const caminho = t.pontos
          .map((p, k) => {
            const [x, y] = para(o, p);
            return `${k ? 'L' : 'M'}${x.toFixed(1)} ${(y + dy).toFixed(1)}`;
          })
          .join(' ');
        return (
          <g key={t.nome}>
            {pegadas.map((p, k) => (
              <g
                key={k}
                className="mapa__pegada"
                style={{ animationDelay: `${p.atraso}ms` } as CSSProperties}
                transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angulo.toFixed(1)}) scale(${escala})`}
              >
                <ellipse cx="0" cy="-3" rx="3.4" ry="5.6" />
                <ellipse cx="0" cy="6.2" rx="2.6" ry="3.1" />
              </g>
            ))}
            <FitaNome
              id={`${id}-${n}`}
              nome={t.nome}
              fonte={t.casal ? fc : fonte}
              caminho={caminho}
              inicio={t.inicio}
              dur={(pegadas.length - 1) * PASSO}
              sumir={t.casal ? encontro : undefined}
            />
          </g>
        );
      })}
      {/* where they meet, the two ribbons give way to one with both names */}
      <FitaNome id={`${id}-casal`} nome={casal} fonte={fc} caminho={`M${cx.toFixed(1)} ${(cy + fonte * 2.7).toFixed(1)} l0 0`} inicio={encontro} dur={1} surgir />
      <path
        className="mapa__coracao"
        style={{ animationDelay: `${encontro}ms` } as CSSProperties}
        transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${(escala * 1.4).toFixed(2)})`}
        d="M0 6 C-9 -1 -11 -9 -5 -11 C-2 -12 0 -9 0 -7 C0 -9 2 -12 5 -11 C11 -9 9 -1 0 6Z"
      />
    </svg>
  );
}

export function MapaMaroto({ onFim }: { onFim: () => void }) {
  const [fase, setFase] = useState<Fase>('fechado');
  const [m, setM] = useState<Medidas>(medir);
  const [somLigado, setSomLigado] = useState(false);
  const som = useRef<Som | null>(null);
  const timers = useRef<number[]>([]);
  const reduzido = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const capa = useRef<HTMLButtonElement>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const aoRedimensionar = () => setM(medir());
    window.addEventListener('resize', aoRedimensionar);
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    capa.current?.focus();
    const lista = timers.current;
    return () => {
      window.removeEventListener('resize', aoRedimensionar);
      document.documentElement.style.overflow = overflow;
      lista.forEach(clearTimeout);
      som.current?.parar();
    };
  }, []);

  // Tells the page behind to wait at the size of the map's window, then to grow to 100% as it leaves.
  // On close the attribute stays until that zoom has finished, so the site settles smoothly.
  useEffect(() => {
    document.body.dataset.mapa = fase === 'saindo' ? 'saindo' : 'aberto';
  }, [fase]);
  useEffect(
    () => () => {
      window.setTimeout(() => {
        if (document.body.dataset.mapa === 'saindo') delete document.body.dataset.mapa;
      }, 1600);
    },
    [],
  );

  const agendar = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  const sair = (rapido = false) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    som.current?.parar();
    setFase('saindo');
    agendar(rapido ? 450 : T.fim - T.sair, onFim);
  };

  const comecar = () => {
    if (fase !== 'fechado') return;
    if (reduzido) {
      setFase('mapa');
      return;
    }
    setFase('capa');
    agendar(T.desdobrar, () => {
      setFase('desdobrando');
      if (som.current) somDePapel(som.current, 0, 2 * m.k, T.dobra / 1000 / (2 * m.k));
    });
    agendar(Math.max(T.desdobrar + T.dobra, T.andar), () => {
      setFase('mapa');
      if (som.current) somDePassos(som.current, 3200);
    });
    agendar(T.malfeito, () => setFase('malfeito'));
    agendar(T.sair, () => sair());
  };

  const alternarSom = () => {
    if (!somLigado && !som.current) {
      try {
        const ctx = new AudioContext();
        som.current = { ctx, parar: () => ctx.close().catch(() => {}) };
      } catch {
        return;
      }
    }
    if (som.current) som.current.mudo = somLigado;
    setSomLigado((s) => !s);
  };

  const andando = fase === 'mapa' || fase === 'malfeito' || fase === 'saindo';
  const aberto = fase !== 'fechado' && fase !== 'capa';
  const classes = [
    'mapa',
    `mapa--${fase}`,
    `mapa--${m.o}`,
    aberto ? 'mapa--aberto' : '',
    andando ? 'mapa--andando' : '',
    reduzido ? 'mapa--reduzido' : '',
  ].join(' ');
  const variaveis = {
    '--W': `${m.W}px`,
    '--H': `${m.H}px`,
    '--capW': `${m.pc}px`,
    '--capH': `${m.H}px`,
  } as CSSProperties;

  return (
    <div ref={raiz} className={classes} style={variaveis} role="dialog" aria-modal="true" aria-label="Abertura: o mapa do casamento">
      <div className="mapa__poeira" aria-hidden />
      <button className="mapa__pular" onClick={() => sair(true)}>
        Pular abertura
      </button>
      <button className="mapa__som" onClick={alternarSom} aria-pressed={somLigado} aria-label={somLigado ? 'Desligar som' : 'Ligar som'}>
        {somLigado ? '♪ Som ligado' : '♪ Som desligado'}
      </button>

      <div className="mapa__palco">
        <div className="mapa__mapa">
          <div className="mapa__sanfona">
            <Sanfona m={m} pegadas={!reduzido && andando} />
          </div>
          <p className="mapa__malfeito">Com muito amor esse dia será feito.</p>
          {reduzido && aberto && (
            <button className="mapa__entrar" onClick={() => sair(true)}>
              Entrar no site
            </button>
          )}
        </div>

        {/* The folded leaflet itself is the cover: this is just its tap target. */}
        <button ref={capa} className="mapa__capa" onClick={comecar} disabled={fase !== 'fechado'} aria-label="Abrir o mapa" />
        <div className="mapa__dica" aria-hidden>
          <span className="mapa__dica-juro">{JURAMENTO}</span>
          <span className="mapa__dica-toque">✦ Toque no mapa com a varinha ✦</span>
        </div>
        {fase === 'fechado' && !reduzido && <Varinha palco={raiz} />}
      </div>
    </div>
  );
}
