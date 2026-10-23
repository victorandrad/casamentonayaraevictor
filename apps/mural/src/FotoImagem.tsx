import { Icon } from '@nv/shared';
import type { Foto } from './fotos';

// The real photo when `src` is set, otherwise a soft placeholder with the caption.
export function FotoImagem({ foto, className = '' }: { foto: Foto; className?: string }) {
  return foto.src ? (
    <img className={className} src={foto.src} alt={foto.alt ?? foto.legenda} loading="lazy" draggable={false} />
  ) : (
    <div className={`${className} galeria-placeholder`} role="img" aria-label={foto.legenda}>
      <Icon name="camera" size={30} />
      <span>{foto.legenda}</span>
    </div>
  );
}
