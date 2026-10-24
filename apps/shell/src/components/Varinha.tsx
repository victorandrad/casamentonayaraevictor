import { useEffect, useRef } from 'react';

export const JURAMENTO = 'Eu juro solenemente que vou celebrar com vocês.';

// Wand that follows the pointer while the map is still folded (the real cursor is hidden by CSS on
// fine pointers only), with the oath written next to its tip and a spark when the map is touched.
export function Varinha({ palco }: { palco: React.RefObject<HTMLDivElement | null> }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raiz = palco.current;
    const varinha = el.current;
    if (!raiz || !varinha) return;
    let feitico = 0;
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      varinha.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      varinha.classList.add('mapa__varinha--visivel');
      // The oath flips to the left of the tip near the right edge of the screen.
      varinha.classList.toggle('mapa__varinha--esquerda', e.clientX > window.innerWidth - 420);
    };
    const tocar = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      varinha.classList.remove('mapa__varinha--feitico');
      void varinha.offsetWidth; // restart the spark animation
      varinha.classList.add('mapa__varinha--feitico');
      window.clearTimeout(feitico);
      feitico = window.setTimeout(() => varinha.classList.remove('mapa__varinha--feitico'), 700);
    };
    const sumir = () => varinha.classList.remove('mapa__varinha--visivel');
    raiz.addEventListener('pointermove', mover);
    raiz.addEventListener('pointerdown', tocar);
    raiz.addEventListener('pointerleave', sumir);
    return () => {
      raiz.removeEventListener('pointermove', mover);
      raiz.removeEventListener('pointerdown', tocar);
      raiz.removeEventListener('pointerleave', sumir);
      window.clearTimeout(feitico);
    };
  }, [palco]);

  return (
    <div ref={el} className="mapa__varinha" aria-hidden>
      <span className="mapa__varinha-brilho" />
      <span className="mapa__varinha-faisca" />
      <svg className="mapa__varinha-arte" viewBox="0 0 140 140">
        <defs>
          <linearGradient id="varinha-madeira" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6a4a2c" />
            <stop offset="0.5" stopColor="#3a2414" />
            <stop offset="1" stopColor="#1f120a" />
          </linearGradient>
        </defs>
        {/* shaft: thin at the tip, thicker toward the handle */}
        <path d="M4 4 L8 2 L92 82 L86 90 Z" fill="url(#varinha-madeira)" />
        <path d="M6 5 L80 76" stroke="rgba(255, 230, 180, 0.35)" strokeWidth="1.2" strokeLinecap="round" />
        {/* knobbly handle */}
        <path
          d="M86 84 C96 80 104 88 100 96 C108 96 114 104 108 110 C116 112 120 120 114 126 C110 134 100 136 94 130 C86 134 78 128 82 120 C74 118 72 108 80 104 C74 100 76 88 86 84 Z"
          fill="url(#varinha-madeira)"
          stroke="#140b05"
          strokeWidth="1.2"
        />
        <path d="M92 92 C100 100 106 108 110 118" stroke="rgba(255, 230, 180, 0.22)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="112" cy="126" r="4" fill="#1a0f08" />
      </svg>
      <span className="mapa__varinha-frase">{JURAMENTO}</span>
    </div>
  );
}
