import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';

// A few slow, translucent petals drifting down the page. Fixed values keep the
// layout identical on every render; CSS hides them for reduced-motion users.
const petals = [
  { left: 6, size: 14, delay: 0, duration: 17, drift: 60 },
  { left: 15, size: 10, delay: 6, duration: 21, drift: -40 },
  { left: 24, size: 16, delay: 11, duration: 19, drift: 80 },
  { left: 33, size: 9, delay: 3, duration: 23, drift: 50 },
  { left: 47, size: 12, delay: 14, duration: 20, drift: -60 },
  { left: 58, size: 15, delay: 8, duration: 18, drift: 40 },
  { left: 67, size: 10, delay: 1, duration: 22, drift: -70 },
  { left: 76, size: 13, delay: 12, duration: 19, drift: 60 },
  { left: 85, size: 11, delay: 5, duration: 24, drift: -50 },
  { left: 93, size: 15, delay: 9, duration: 18, drift: -30 },
];

const RADIUS = 130; // how close the cursor must get, in px
const PUSH = 70; // max distance a petal is blown away, in px

// Petals near the pointer are gently blown away, twirl and glow. The outer span
// keeps falling (CSS animation); only the inner leaf is offset, so the fall
// position stays the reference and the leaf drifts back once the cursor leaves.
function usePointerBreeze(leaves: RefObject<(HTMLSpanElement | null)[]>) {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let pointer: { x: number; y: number } | null = null;
    let frame = 0;

    const tick = () => {
      frame = 0;
      for (const leaf of leaves.current) {
        if (!leaf?.parentElement) continue;
        const r = leaf.parentElement.getBoundingClientRect();
        const dx = r.left + r.width / 2 - (pointer?.x ?? -1e4);
        const dy = r.top + r.height / 2 - (pointer?.y ?? -1e4);
        const dist = Math.hypot(dx, dy);
        if (pointer && dist < RADIUS) {
          const force = 1 - dist / RADIUS;
          const nx = dist ? dx / dist : 0;
          const ny = dist ? dy / dist : -1;
          leaf.style.setProperty('--px', `${(nx * PUSH * force).toFixed(1)}px`);
          leaf.style.setProperty('--py', `${(ny * PUSH * force).toFixed(1)}px`);
          leaf.style.setProperty('--pr', `${((nx >= 0 ? 1 : -1) * 220 * force).toFixed(0)}deg`);
          leaf.style.setProperty('--ps', (1 + 0.35 * force).toFixed(2));
          leaf.classList.add('is-near');
        } else if (leaf.classList.contains('is-near')) {
          leaf.style.removeProperty('--px');
          leaf.style.removeProperty('--py');
          leaf.style.removeProperty('--pr');
          leaf.style.removeProperty('--ps');
          leaf.classList.remove('is-near');
        }
      }
      // Keep checking while the pointer is on the page: petals fall into it too.
      if (pointer) frame = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      pointer = null;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [leaves]);
}

export function Petals() {
  const leaves = useRef<(HTMLSpanElement | null)[]>([]);
  usePointerBreeze(leaves);

  return (
    <div className="shell-petals" aria-hidden>
      {petals.map((p, i) => (
        <span
          key={i}
          className="shell-petal"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.25,
              animationDelay: `-${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--drift': `${p.drift}px`,
            } as CSSProperties
          }
        >
          <span
            className="shell-petal__leaf"
            ref={(el) => {
              leaves.current[i] = el;
            }}
          />
        </span>
      ))}
    </div>
  );
}
