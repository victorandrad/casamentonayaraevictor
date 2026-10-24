import { casamento } from '@nv/shared';

// Inside of the map: corridors, the "rooms" of the wedding and the title cartouche, drawn in ink.
// The layout is in units of 0..1 (landscape) and is transposed for the portrait (phone) version.
export type Orientacao = 'horizontal' | 'vertical';
export type P = [number, number];

const TINTA = '#4a2f1b';

const CORREDORES: P[][] = [
  [[0.03, 0.55], [0.97, 0.55]],
  [[0.2, 0.1], [0.2, 0.9]],
  [[0.8, 0.1], [0.8, 0.9]],
  [[0.5, 0.55], [0.5, 0.71]],
  [[0.2, 0.2], [0.8, 0.2]],
];

// `afastado`: the label keeps away from where the couple meet (bottom of the room in landscape,
// top in portrait). `nomeVertical`: label lines for the narrower portrait rooms.
const SALAS: Array<{ r: [number, number, number, number]; nome: string[]; nomeVertical?: string[]; afastado?: boolean }> = [
  { r: [0.03, 0.06, 0.15, 0.34], nome: ['Chá-Bar'] },
  { r: [0.29, 0.04, 0.43, 0.15], nome: ['Lista de', 'presentes'] },
  { r: [0.57, 0.04, 0.71, 0.15], nome: ['Mural de', 'recados'] },
  { r: [0.85, 0.06, 0.97, 0.34], nome: ['Galeria'] },
  { r: [0.03, 0.7, 0.15, 0.94], nome: ['Confirmar', 'presença'] },
  { r: [0.24, 0.66, 0.36, 0.84], nome: ['Traje'] },
  { r: [0.4, 0.71, 0.6, 0.96], nome: ['Paróquia São José'], nomeVertical: ['Paróquia', 'São José'], afastado: true },
  { r: [0.64, 0.66, 0.76, 0.84], nome: ['Pista de', 'dança'] },
  { r: [0.85, 0.68, 0.97, 0.94], nome: ['Recanto', 'Espelho', 'da Lua'] },
];

// Footprint paths along the corridors; the couple meet at the altar.
export const TRILHAS: Array<{ nome: string; pontos: P[]; inicio: number; casal?: boolean }> = [
  { nome: 'Aluado', pontos: [[0.2, 0.9], [0.2, 0.62]], inicio: 0 },
  { nome: 'Almofadinhas', pontos: [[0.2, 0.1], [0.2, 0.2], [0.34, 0.2]], inicio: 250 },
  { nome: 'Rabicho', pontos: [[0.8, 0.9], [0.8, 0.62]], inicio: 450 },
  { nome: 'Pontas', pontos: [[0.8, 0.1], [0.8, 0.2], [0.66, 0.2]], inicio: 650 },
  { nome: casamento.noiva, pontos: [[0.04, 0.55], [0.485, 0.55], [0.485, 0.75]], inicio: 900, casal: true },
  { nome: casamento.noivo, pontos: [[0.96, 0.55], [0.515, 0.55], [0.515, 0.75]], inicio: 900, casal: true },
];
export const ENCONTRO: P = [0.5, 0.775];

export const caixa = (o: Orientacao) => (o === 'horizontal' ? { w: 2600, h: 1000 } : { w: 1000, h: 1613 });

// Landscape units → this orientation's viewBox units.
export function para(o: Orientacao, [x, y]: P): P {
  const { w, h } = caixa(o);
  return o === 'horizontal' ? [x * w, y * h] : [y * w, x * h];
}

function retangulo(o: Orientacao, [x0, y0, x1, y1]: [number, number, number, number]) {
  const [ax, ay] = para(o, [x0, y0]);
  const [bx, by] = para(o, [x1, y1]);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

const caminho = (o: Orientacao, pts: P[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${para(o, p).map((n) => n.toFixed(1)).join(' ')}`).join(' ');

export function PlantaMapa({ orientacao: o, id }: { orientacao: Orientacao; id: string }) {
  const { w, h } = caixa(o);
  const largura = o === 'horizontal' ? 46 : 52;
  const fonte = o === 'horizontal' ? 30 : 34;
  const titulo = retangulo(o, [0.36, 0.27, 0.64, 0.47]);
  const [rx, ry] = para(o, [0.09, 0.45]);
  const corredores = CORREDORES.map((c) => caminho(o, c)).join(' ');

  return (
    <g className="mapa__planta">
      <defs>
        <mask id={`${id}-corredores`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
          <rect width={w} height={h} fill="black" />
          <path d={corredores} stroke="white" strokeWidth={largura + 7} strokeLinecap="square" strokeLinejoin="miter" fill="none" />
          <path d={corredores} stroke="black" strokeWidth={largura} strokeLinecap="square" strokeLinejoin="miter" fill="none" />
        </mask>
      </defs>
      {/* border of the sheet */}
      <rect x="14" y="14" width={w - 28} height={h - 28} fill="none" stroke={TINTA} strokeWidth="3" opacity="0.7" />
      <rect x="24" y="24" width={w - 48} height={h - 48} fill="none" stroke={TINTA} strokeWidth="1.2" opacity="0.55" />
      {/* corridors: double walls */}
      <rect width={w} height={h} fill={TINTA} mask={`url(#${id}-corredores)`} opacity="0.85" />
      {/* rooms */}
      {SALAS.map((s) => {
        const r = retangulo(o, s.r);
        const cx = r.x + r.w / 2;
        const linhas = o === 'vertical' && s.nomeVertical ? s.nomeVertical : s.nome;
        const centro = !s.afastado ? r.y + r.h / 2 : o === 'horizontal' ? r.y + r.h * 0.84 : r.y + r.h * 0.24;
        // Smaller letters when the longest line would not fit the room's width.
        const fs = Math.min(fonte, (r.w - 24) / (Math.max(...linhas.map((l) => l.length)) * 0.47));
        const topo = centro - ((linhas.length - 1) * fs * 1.1) / 2 + fs * 0.35;
        return (
          <g key={s.nome.join(' ')}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(240, 225, 189, 0.55)" stroke={TINTA} strokeWidth="2.6" />
            <rect x={r.x + 9} y={r.y + 9} width={r.w - 18} height={r.h - 18} fill="none" stroke={TINTA} strokeWidth="1" opacity="0.6" />
            <g fill={TINTA} fontFamily="'IM Fell English', Georgia, serif" fontStyle="italic" fontSize={fs} textAnchor="middle">
              {linhas.map((linha, i) => (
                <text key={i} x={cx} y={topo + i * fs * 1.1}>
                  {linha}
                </text>
              ))}
            </g>
          </g>
        );
      })}
      {/* title cartouche */}
      <g>
        <rect x={titulo.x} y={titulo.y} width={titulo.w} height={titulo.h} fill="rgba(240, 225, 189, 0.7)" stroke={TINTA} strokeWidth="3" />
        <rect x={titulo.x + 10} y={titulo.y + 10} width={titulo.w - 20} height={titulo.h - 20} fill="none" stroke={TINTA} strokeWidth="1.2" />
        {o === 'horizontal' ? (
          <g fill={TINTA} textAnchor="middle">
            <text x={titulo.x + titulo.w / 2} y={titulo.y + titulo.h * 0.36} fontFamily="'IM Fell English SC', Georgia, serif" fontSize={fonte * 1.15}>
              O Mapa do Casamento
            </text>
            <text x={titulo.x + titulo.w / 2} y={titulo.y + titulo.h * 0.66} fontFamily="'Pinyon Script', cursive" fontSize={fonte * 1.7}>
              {casamento.noiva} &amp; {casamento.noivo}
            </text>
            <text x={titulo.x + titulo.w / 2} y={titulo.y + titulo.h * 0.86} fontFamily="'IM Fell English', Georgia, serif" fontStyle="italic" fontSize={fonte * 0.75}>
              {casamento.dataExtenso}
            </text>
          </g>
        ) : (
          // Portrait: the cartouche is narrow and tall, so the lines are stacked.
          <g fill={TINTA} textAnchor="middle">
            {[
              { t: 'O Mapa do', y: 0.16, f: "'IM Fell English SC', Georgia, serif", s: 0.95 },
              { t: 'Casamento', y: 0.26, f: "'IM Fell English SC', Georgia, serif", s: 0.95 },
              { t: `${casamento.noiva} &`, y: 0.5, f: "'Pinyon Script', cursive", s: 1.45 },
              { t: casamento.noivo, y: 0.64, f: "'Pinyon Script', cursive", s: 1.45 },
              { t: casamento.dataCurta, y: 0.86, f: "'IM Fell English', Georgia, serif", s: 0.7 },
            ].map((l) => (
              <text key={l.t} x={titulo.x + titulo.w / 2} y={titulo.y + titulo.h * l.y} fontFamily={l.f} fontSize={fonte * l.s}>
                {l.t}
              </text>
            ))}
          </g>
        )}
      </g>
      {/* compass rose */}
      <g transform={`translate(${rx} ${ry})`} fill="none" stroke={TINTA} strokeWidth="1.6">
        <circle r={o === 'horizontal' ? 40 : 46} />
        <path d="M0 -58 L9 0 L0 58 L-9 0 Z M-58 0 L0 9 L58 0 L0 -9 Z" fill="rgba(74,47,27,0.15)" />
        <text y="-64" fill={TINTA} stroke="none" fontFamily="'IM Fell English SC', Georgia, serif" fontSize={fonte * 0.7} textAnchor="middle">
          N
        </text>
      </g>
    </g>
  );
}

const VERSO = 'MESSRS AVLVADO RABICHO ALMOFADINHAS ET PONTAS · AMOR OMNIA VINCIT · NAYARA ET VICTOR · ';

// Back of one panel of the map: lines of Latin ink running down the paper, so the reverse of the
// leaflet is never blank. Drawn in the panel's own size (px), with the phrase shifted per panel.
export function VersoMapa({ largura, altura, indice }: { largura: number; altura: number; indice: number }) {
  const fonte = Math.max(9, Math.min(largura, altura) * 0.055);
  const linhas = Array.from({ length: 4 }, (_, k) => {
    const y = altura * (0.18 + k * 0.22);
    const amp = altura * 0.025;
    return `M-10 ${(y).toFixed(1)} C${(largura * 0.3).toFixed(1)} ${(y - amp).toFixed(1)} ${(largura * 0.6).toFixed(1)} ${(y + amp).toFixed(1)} ${(largura + 10).toFixed(1)} ${(y - amp * 0.5).toFixed(1)}`;
  });
  return (
    <svg className="mapa__verso-texto" viewBox={`0 0 ${largura} ${altura}`} aria-hidden>
      {linhas.map((d, k) => (
        <g key={k}>
          <path id={`mapa-verso-${indice}-${k}`} d={d} fill="none" />
          <text fill={TINTA} fontFamily="'IM Fell English SC', Georgia, serif" fontSize={fonte} letterSpacing="1">
            <textPath href={`#mapa-verso-${indice}-${k}`} startOffset={`${-((indice * 37 + k * 19) % 60)}%`}>
              {VERSO.repeat(4)}
            </textPath>
          </text>
        </g>
      ))}
    </svg>
  );
}
