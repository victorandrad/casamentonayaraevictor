import { SectionHeader } from '@nv/shared';
import './evento.css';

const paleta = [
  ['#c58a83', '#b3766f'],
  ['#d9c8b6', '#c9b8a6'],
  ['#8a8b6f', '#767750'],
  ['#6b5e52', '#5a4e43'],
  ['#43382f', '#362d26'],
];

export default function Traje() {
  return (
    <section id="traje" className="nv-section">
      <div className="nv-container--narrow traje">
        <SectionHeader eyebrow="Dress code" title="Traje" />
        <p className="nv-italic traje__style">Esporte fino</p>
        <p className="traje__text">
          Pedimos que reservem o tom branco e off-white para a noiva. Uma paleta em tons suaves e terrosos combina
          lindamente com a nossa celebração.
        </p>
        <div className="traje__palette">
          {paleta.map(([cor, borda]) => (
            <span key={cor} style={{ background: cor, borderColor: borda }} />
          ))}
        </div>
      </div>
    </section>
  );
}
