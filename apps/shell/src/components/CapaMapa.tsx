// Cover of the folded map (original art, in the visual language of the Marauder's Map): a big
// curling ribbon banner, the four marauders "proud to present", an ink castle-like church under a
// red wax seal with the title, and dense winding ribbons of tiny Latin text filling the bottom.
const TINTA = '#4a2f1b';
const ACENTO = '#7a2a1c';
const PAPEL = 'rgba(233, 216, 178, 0.92)';
const SC = "'IM Fell English SC', Georgia, serif";
const SCRIPT = "'Pinyon Script', cursive";
const FRASE = 'AMOR OMNIA VINCIT · NAYARA ET VICTOR · DVO IN CARNE VNA · VBI TV CAIVS EGO CAIA · SEMPER FIDELIS · IN AETERNVM · ';

const f = (n: number) => n.toFixed(1);

// Deterministic pseudo-random so the ink specks never change between renders.
function aleatorio(semente: number) {
  let s = semente;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Archimedean spiral as a path.
function espiral(cx: number, cy: number, r0: number, r1: number, voltas: number, sentido = 1, fase = 0) {
  const passos = Math.round(voltas * 40);
  const pts: string[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    const a = fase + sentido * t * voltas * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push(`${i ? 'L' : 'M'}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`);
  }
  return pts.join(' ');
}

// Wavy line from (x0, y0) to (x1, y1).
function onda(x0: number, y0: number, x1: number, y1: number, amp: number, ondas: number, fase = 0) {
  const n = 48;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(`${i ? 'L' : 'M'}${f(x0 + (x1 - x0) * t)} ${f(y0 + (y1 - y0) * t + amp * Math.sin(fase + t * ondas * Math.PI * 2))}`);
  }
  return pts.join(' ');
}

// Stains and specks of old paper.
function Manchas() {
  const rnd = aleatorio(11);
  const pontos = Array.from({ length: 90 }, () => ({ x: rnd() * 500, y: rnd() * 1050, r: 0.6 + rnd() * 1.6, o: 0.15 + rnd() * 0.35 }));
  return (
    <g style={{ mixBlendMode: 'multiply' }}>
      <defs>
        <filter id="capa-mancha" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="40" />
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>
      <g fill="#6b4a22" filter="url(#capa-mancha)">
        <ellipse cx="90" cy="300" rx="80" ry="56" opacity="0.2" />
        <ellipse cx="450" cy="420" rx="60" ry="90" opacity="0.2" />
        <ellipse cx="50" cy="760" rx="52" ry="70" opacity="0.22" />
        <ellipse cx="420" cy="980" rx="90" ry="50" opacity="0.18" />
        <ellipse cx="250" cy="520" rx="120" ry="34" opacity="0.1" />
        <ellipse cx="150" cy="1010" rx="70" ry="34" opacity="0.16" />
        <ellipse cx="470" cy="60" rx="50" ry="40" opacity="0.26" />
        <ellipse cx="20" cy="40" rx="40" ry="60" opacity="0.2" />
        <ellipse cx="480" cy="860" rx="34" ry="60" opacity="0.2" />
        <circle cx="30" cy="560" r="22" opacity="0.22" />
        <circle cx="330" cy="470" r="14" opacity="0.14" />
      </g>
      <g fill={TINTA}>
        {pontos.map((p, i) => (
          <circle key={i} cx={f(p.x)} cy={f(p.y)} r={f(p.r)} opacity={p.o} />
        ))}
      </g>
    </g>
  );
}

// Ribbon band with outline, fill and a text along it.
function Faixa({ id, d, texto, largura = 54, fonte = 30, posicao = "50%" }: { id: string; d: string; texto: string; largura?: number; fonte?: number; posicao?: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke={TINTA} strokeWidth={largura + 5} strokeLinecap="butt" />
      <path d={d} fill="none" stroke="#f1e3c0" strokeWidth={largura} strokeLinecap="butt" />
      <path d={d} fill="none" stroke={TINTA} strokeWidth="1" opacity="0.5" transform="translate(0 -17)" />
      <path d={d} fill="none" stroke={TINTA} strokeWidth="1" opacity="0.5" transform="translate(0 17)" />
      <path id={id} d={d} fill="none" transform={`translate(0 ${fonte * 0.36})`} />
      <text fill={TINTA} fontFamily={SC} fontSize={fonte} letterSpacing="2">
        <textPath href={`#${id}`} startOffset={posicao} textAnchor="middle">
          {texto}
        </textPath>
      </text>
    </g>
  );
}

function Banner() {
  const cachos = [
    espiral(46, 160, 3, 30, 1.6, 1, 2.6),
    espiral(456, 112, 3, 28, 1.6, -1, 0.4),
    espiral(118, 58, 2, 20, 1.4, -1, 3.4),
    espiral(386, 44, 2, 22, 1.4, 1, 0.2),
    espiral(250, 44, 2, 16, 1.2, 1, 1.5),
    espiral(196, 190, 2, 18, 1.3, 1, 1),
    espiral(318, 196, 2, 18, 1.3, -1, 2.2),
    espiral(72, 258, 2, 24, 1.5, -1, 2.8),
    espiral(428, 236, 2, 22, 1.5, 1, 0.9),
    onda(36, 186, 24, 336, 9, 2.3, 0.4),
    onda(464, 136, 478, 300, 9, 2.4, 2),
    onda(96, 64, 42, 120, 6, 1.4, 0),
    onda(404, 58, 462, 100, 6, 1.4, 1),
    onda(140, 196, 110, 300, 7, 1.8, 0.6),
    onda(360, 200, 392, 296, 7, 1.8, 2.4),
  ];
  return (
    <g>
      {/* curling ribbon tails */}
      <g fill="none" strokeLinecap="round">
        {cachos.map((d, i) => (
          <g key={i}>
            <path d={d} stroke={TINTA} strokeWidth="9" />
            <path d={d} stroke="#efe0bd" strokeWidth="5.5" />
            <path d={d} stroke={ACENTO} strokeWidth="0.9" opacity="0.8" />
          </g>
        ))}
      </g>
      {/* forked ends under the bands */}
      <path d="M36 160 L0 206 L66 198 Z" fill="#e4cf9f" stroke={TINTA} strokeWidth="2" strokeLinejoin="round" />
      <path d="M466 94 L498 140 L434 140 Z" fill="#e4cf9f" stroke={TINTA} strokeWidth="2" strokeLinejoin="round" />
      <Faixa id="capa-faixa-a" d="M26 168 C100 72 232 80 312 142" texto="Itinerarivm" fonte={27} posicao="41%" />
      <Faixa id="capa-faixa-b" d="M198 114 C280 186 390 176 474 100" texto="Nvptiarvm" fonte={27} posicao="57%" />
      {/* where band B goes under band A */}
      <path d="M244 120 L228 150 L258 170" fill="none" stroke={TINTA} strokeWidth="1.2" opacity="0.6" />
    </g>
  );
}

function Cabecalho() {
  return (
    <g fill={TINTA} textAnchor="middle">
      <text x="250" y="320" fontFamily={SCRIPT} fontSize="46">
        Os Senhores
      </text>
      <g fontFamily={SC} letterSpacing="1.5">
        <text x="226" y="378" fontSize="42" textAnchor="end">
          Aluado
        </text>
        <text x="278" y="378" fontSize="42" textAnchor="start">
          Rabicho
        </text>
        <text x="226" y="422" fontSize="30" textAnchor="end">
          Almofadinhas
        </text>
        <text x="278" y="422" fontSize="42" textAnchor="start">
          Pontas
        </text>
      </g>
      <text x="252" y="426" fontFamily={SCRIPT} fontSize="118">
        &amp;
      </text>
      <text x="250" y="470" fontFamily={SCRIPT} fontSize="34">
        estão orgulhosos em apresentar
      </text>
    </g>
  );
}

type Pt = [number, number];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const poly = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join(' ') + ' Z';

// A wall seen in 3/4 perspective between two ground points, with battlements, stone hints
// and windows along it.
function Parede({ a, b, h, janelas = 0, portao, semente }: { a: Pt; b: Pt; h: number; janelas?: number; portao?: boolean; semente: number }) {
  const rnd = aleatorio(semente);
  const topoA: Pt = [a[0], a[1] - h];
  const topoB: Pt = [b[0], b[1] - h];
  const comp = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.floor(comp / 16));
  const ameias = Array.from({ length: n }, (_, i) => {
    const p = lerp(topoA, topoB, (i + 0.25) / n);
    const q = lerp(topoA, topoB, (i + 0.75) / n);
    return poly([p, q, [q[0], q[1] - 9], [p[0], p[1] - 9]]);
  });
  const pedras = Array.from({ length: Math.round(comp / 7) }, () => {
    const p = lerp(a, b, rnd());
    const y = p[1] - 6 - rnd() * (h - 12);
    return `M${f(p[0])} ${f(y)} l${f(5 + rnd() * 9)} ${f(((b[1] - a[1]) / comp) * 6)}`;
  });
  const jan = Array.from({ length: janelas }, (_, i) => {
    const p = lerp(a, b, (i + 1) / (janelas + 1));
    return `M${f(p[0] - 3)} ${f(p[1] - h * 0.55)} l0 -10 q3 -5 6 0 l0 10 Z`;
  });
  const meio = lerp(a, b, 0.5);
  return (
    <g stroke={TINTA} strokeLinejoin="round" strokeLinecap="round">
      <path d={poly([a, b, topoB, topoA])} fill={PAPEL} strokeWidth="2" />
      <path d={pedras.join(' ')} strokeWidth="0.8" opacity="0.5" />
      <g strokeWidth="1.6" fill={PAPEL}>
        {ameias.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <path d={jan.join(' ')} fill={TINTA} opacity="0.8" strokeWidth="1" />
      {portao && <path d={`M${f(meio[0] - 11)} ${f(meio[1] + 2)} l0 -24 q11 -14 22 0 l0 24 Z`} fill={TINTA} opacity="0.85" strokeWidth="1.4" />}
    </g>
  );
}

// A round tower with a conical roof.
function Torre({ x, base, r, h, apice, cruz, semente }: { x: number; base: number; r: number; h: number; apice: number; cruz?: boolean; semente: number }) {
  const rnd = aleatorio(semente);
  const topo = base - h;
  const janelas = Array.from({ length: Math.max(1, Math.floor(h / 42)) }, (_, i) => topo + 24 + i * 42);
  const pedras = Array.from({ length: Math.round(h / 6) }, () => `M${f(x - r + 3 + rnd() * (r * 2 - 12))} ${f(topo + 6 + rnd() * (h - 12))} l${f(4 + rnd() * 6)} 0`);
  const ry = r * 0.42;
  return (
    <g stroke={TINTA} strokeLinejoin="round" strokeLinecap="round">
      <path d={`M${x - r} ${topo} L${x - r} ${base} A${r} ${ry} 0 0 0 ${x + r} ${base} L${x + r} ${topo}`} fill={PAPEL} strokeWidth="2" />
      <path d={pedras.join(' ')} strokeWidth="0.8" opacity="0.5" />
      {/* shade */}
      <path d={`M${x + r * 0.55} ${topo + 4} L${x + r * 0.55} ${base + ry * 0.8} M${x + r * 0.78} ${topo + 4} L${x + r * 0.78} ${base + ry * 0.55}`} strokeWidth="0.9" opacity="0.55" />
      {/* roof */}
      <path d={`M${x - r - 5} ${topo} A${r + 5} ${ry} 0 0 1 ${x + r + 5} ${topo} L${x} ${topo - apice} Z`} fill={PAPEL} strokeWidth="2" />
      <path d={`M${x - r - 5} ${topo} A${r + 5} ${ry} 0 0 0 ${x + r + 5} ${topo}`} fill="none" strokeWidth="2" />
      <path d={`M${x} ${topo - apice} L${x - r * 0.45} ${topo + ry * 0.9} M${x} ${topo - apice} L${x + r * 0.35} ${topo + ry} M${x} ${topo - apice} L${x + r * 0.8} ${topo + ry * 0.6}`} strokeWidth="0.8" opacity="0.6" />
      {cruz ? (
        <path d={`M${x} ${topo - apice} l0 -22 M${x - 8} ${topo - apice - 15} l16 0`} strokeWidth="2.2" />
      ) : (
        <path d={`M${x} ${topo - apice} l0 -16 l13 5 l-13 5`} fill="#e4cf9f" strokeWidth="1.4" />
      )}
      <g strokeWidth="1" fill={TINTA} opacity="0.8">
        {janelas.map((y) => (
          <path key={y} d={`M${x - 4} ${y + 10} l0 -10 q4 -6 8 0 l0 10 Z`} />
        ))}
      </g>
    </g>
  );
}

// The ceremony church drawn like an ink castle in 3/4 perspective: a walled courtyard with
// corner towers, the keep with its turrets and the great spire with a cross.
function Castelo() {
  const E: Pt = [84, 768];
  const Fr: Pt = [258, 906];
  const D: Pt = [440, 764];
  const T: Pt = [262, 626];
  const kE: Pt = [176, 742];
  const kF: Pt = [262, 810];
  const kD: Pt = [348, 740];
  const kT: Pt = [262, 674];
  return (
    <g>
      {/* flag with the church's name */}
      <g>
        <path d={onda(58, 574, 50, 690, 5, 1.6, 0.3)} fill="none" stroke={TINTA} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M24 546 C74 530 114 552 158 536" fill="none" stroke={TINTA} strokeWidth="30" />
        <path d="M24 546 C74 530 114 552 158 536" fill="none" stroke="#f1e3c0" strokeWidth="25" />
        <path d="M20 534 L4 558 L28 561 Z" fill="#e4cf9f" stroke={TINTA} strokeWidth="1.6" strokeLinejoin="round" />
        <path id="capa-bandeira" d="M28 552 C78 536 118 558 162 542" fill="none" />
        <text fill={TINTA} fontFamily={SC} fontSize="17" letterSpacing="2">
          <textPath href="#capa-bandeira" startOffset="50%" textAnchor="middle">
            São José
          </textPath>
        </text>
      </g>
      {/* hill */}
      <g fill="none" stroke={TINTA} strokeLinecap="round" transform="translate(0 16)">
        <path d="M24 846 C90 800 180 790 254 904 C330 800 420 790 486 836" strokeWidth="1.6" />
        <path d="M40 876 C120 836 200 838 254 922 C310 838 400 836 476 870" strokeWidth="1.1" opacity="0.7" />
        <path d="M80 904 C150 876 220 880 254 936 C290 880 360 876 430 900" strokeWidth="0.9" opacity="0.5" />
      </g>
      {/* back walls (seen from inside) and back tower */}
      <Torre x={T[0]} base={T[1]} r={15} h={88} apice={50} semente={41} />
      <Parede a={E} b={T} h={50} semente={42} />
      <Parede a={T} b={D} h={50} semente={43} />
      {/* keep */}
      <Parede a={kE} b={kT} h={96} semente={44} />
      <Parede a={kT} b={kD} h={96} semente={45} />
      <Parede a={kE} b={kF} h={96} janelas={3} semente={46} />
      <Parede a={kF} b={kD} h={96} janelas={3} semente={47} />
      <Torre x={kE[0]} base={kE[1]} r={13} h={126} apice={58} semente={48} />
      <Torre x={kD[0]} base={kD[1]} r={13} h={130} apice={60} semente={49} />
      <Torre x={kT[0] + 40} base={kT[1] + 4} r={11} h={150} apice={64} semente={50} />
      <Torre x={kT[0] - 40} base={kT[1] + 4} r={11} h={146} apice={62} semente={51} />
      <Torre x={262} base={716} r={22} h={190} apice={110} cruz semente={52} />
      <Torre x={kF[0]} base={kF[1]} r={12} h={110} apice={54} semente={53} />
      {/* front walls with the gate and the corner towers */}
      <Parede a={E} b={Fr} h={62} janelas={4} semente={54} />
      <Parede a={Fr} b={D} h={62} janelas={4} portao semente={55} />
      <Torre x={E[0]} base={E[1]} r={19} h={120} apice={66} semente={56} />
      <Torre x={D[0]} base={D[1]} r={19} h={124} apice={68} semente={57} />
      <Torre x={Fr[0]} base={Fr[1]} r={18} h={104} apice={60} semente={58} />
      {/* trees */}
      <g fill="none" stroke={TINTA} strokeWidth="1.6" strokeLinecap="round">
        <path d="M30 820 L30 792 M22 796 C4 784 12 756 30 758 C48 756 56 784 38 796 Z" />
        <path d="M480 816 L480 790 M472 794 C454 782 462 754 480 756 C498 754 506 782 488 794 Z" />
        <path d="M120 900 L120 876 M113 879 C98 869 105 846 120 848 C135 846 142 869 127 879 Z" />
        <path d="M392 904 L392 880 M385 883 C370 873 377 850 392 852 C407 850 414 873 399 883 Z" />
      </g>
    </g>
  );
}

// Red wax seal over the castle with the title, shaped as a diamond lying in the castle's perspective.
const SELO = 'M258 657 Q332 695 386 758 Q332 821 258 859 Q184 821 130 758 Q184 695 258 657 Z';
function Selo() {
  return (
    <g style={{ mixBlendMode: 'multiply' }}>
      <defs>
        <radialGradient id="capa-selo-cor" cx="42%" cy="38%" r="72%">
          <stop offset="0%" stopColor="#9a2420" />
          <stop offset="55%" stopColor="#6e1512" />
          <stop offset="100%" stopColor="#3a0806" />
        </radialGradient>
        <filter id="capa-selo-borda" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="9" />
          <feDisplacementMap in="SourceGraphic" scale="22" />
        </filter>
      </defs>
      {/* Diamond in the same perspective as the castle's courtyard */}
      <path
        d={SELO}
        fill="url(#capa-selo-cor)"
        filter="url(#capa-selo-borda)"
        opacity="0.95"
      />
      <path d={SELO} fill="none" stroke="#f4e3c7" strokeWidth="1" opacity="0.25" transform="translate(258 758) scale(0.86) translate(-258 -758)" filter="url(#capa-selo-borda)" />
      <g fill="#f6ead8" textAnchor="middle">
        <text x="258" y="716" fontFamily={SCRIPT} fontSize="40">
          O
        </text>
        <text x="258" y="762" fontFamily={SC} fontSize="35" letterSpacing="1.5">
          Mapa do
        </text>
        <text x="258" y="800" fontFamily={SC} fontSize="29" letterSpacing="1">
          Casamento
        </text>
      </g>
    </g>
  );
}

// Winding ribbons of tiny Latin text filling the lower part of the cover (and a tree of words).
function TextoSerpente() {
  const caminhos: Array<{ d: string; tam?: number; op?: number }> = [
    // around the foot of the castle
    { d: 'M14 650 C22 740 60 830 150 884', tam: 11 },
    { d: 'M8 700 C18 790 70 870 170 912', tam: 11 },
    { d: 'M4 760 C20 840 80 900 190 930', tam: 11 },
    { d: 'M490 660 C486 750 450 840 364 890', tam: 11 },
    { d: 'M496 712 C488 800 440 884 350 918', tam: 11 },
    { d: 'M498 770 C484 850 430 900 320 936', tam: 11 },
    // spirals
    { d: espiral(76, 980, 4, 64, 2.4, 1, 0.5), tam: 10 },
    { d: espiral(426, 996, 4, 50, 2, -1, 2.5), tam: 10 },
    { d: espiral(44, 700, 3, 36, 1.8, -1, 1), tam: 9 },
    { d: espiral(40, 620, 3, 26, 1.5, 1, 2), tam: 8.5 },
    { d: espiral(462, 690, 3, 30, 1.6, 1, 2), tam: 9 },
    { d: espiral(150, 930, 3, 40, 1.8, 1, 0.4), tam: 9 },
    { d: espiral(340, 940, 3, 42, 1.9, -1, 1.7), tam: 9 },
    { d: onda(6, 560, 30, 760, 10, 2.2, 0.5), tam: 9.5 },
    { d: onda(496, 600, 470, 760, 10, 2, 1.8), tam: 9.5 },
    // waves across the bottom
    { d: onda(-10, 912, 512, 907, 8.0, 2.0, 0.0), tam: 10.5 },
    { d: onda(-10, 924, 512, 920, 9.5, 2.2, 1.3), tam: 10.5 },
    { d: onda(-10, 937, 512, 932, 11.0, 2.4, 2.6), tam: 10.5 },
    { d: onda(-10, 950, 512, 944, 12.5, 2.0, 3.9), tam: 10.5 },
    { d: onda(-10, 962, 512, 957, 8.0, 2.2, 5.2), tam: 10.5 },
    { d: onda(-10, 974, 512, 970, 9.5, 2.4, 0.2), tam: 10.5 },
    { d: onda(-10, 987, 512, 982, 11.0, 2.0, 1.5), tam: 10.5 },
    { d: onda(-10, 1000, 512, 994, 12.5, 2.2, 2.8), tam: 10.5 },
    { d: onda(-10, 1012, 512, 1007, 8.0, 2.4, 4.1), tam: 10.5 },
    { d: onda(-10, 1024, 512, 1020, 9.5, 2.0, 5.4), tam: 10.5, op: 0.85 },
    { d: onda(-10, 1037, 512, 1032, 11.0, 2.2, 0.4), tam: 10.5, op: 0.7 },
    { d: onda(-10, 1050, 512, 1044, 12.5, 2.4, 1.7), tam: 10.5, op: 0.55 },
    // tree of words on the right
    { d: 'M452 706 C448 680 452 650 446 622', tam: 9 },
    { d: 'M446 622 C430 600 414 580 404 556', tam: 8 },
    { d: 'M446 622 C440 596 434 570 436 540', tam: 8 },
    { d: 'M446 622 C450 596 452 568 456 536', tam: 8 },
    { d: 'M446 622 C458 598 470 574 484 554', tam: 8 },
    { d: 'M446 622 C464 606 482 594 496 590', tam: 8 },
    { d: 'M446 622 C426 610 410 606 396 608', tam: 8 },
    { d: 'M446 622 C446 596 436 580 418 566', tam: 7.5 },
    { d: 'M446 622 C458 604 466 584 470 560', tam: 7.5 },
  ];
  return (
    <g fill="#3a2412" fontFamily={SC} letterSpacing="0.6">
      {caminhos.map((c, i) => (
        <g key={i}>
          <path id={`capa-serp-${i}`} d={c.d} fill="none" />
          <text fontSize={c.tam ?? 11} opacity={c.op ?? 1}>
            <textPath href={`#capa-serp-${i}`}>{FRASE.repeat(5)}</textPath>
          </text>
        </g>
      ))}
    </g>
  );
}

export function CapaMapa() {
  return (
    <svg className="mapa__capa-arte" viewBox="0 0 500 1050" role="img" aria-label="O Mapa do Casamento">
      <Manchas />
      <Banner />
      <Cabecalho />
      <TextoSerpente />
      <Castelo />
      <Selo />
    </svg>
  );
}
