import { Icon, locais, MapsLink, SectionHeader, type IconName } from '@nv/shared';
import './evento.css';

const cards: Array<{ icon: IconName; titulo: string; local: (typeof locais)[keyof typeof locais] }> = [
  { icon: 'church', titulo: 'Cerimônia', local: locais.cerimonia },
  { icon: 'cheers', titulo: 'Recepção', local: locais.recepcao },
];

export default function Evento() {
  return (
    <section id="evento" className="nv-section">
      <div className="nv-container">
        <SectionHeader eyebrow="O grande dia" title="Cerimônia & Recepção" />
        <div className="evento-grid">
          {cards.map(({ icon, titulo, local }) => (
            <div key={titulo} className="nv-card nv-arch evento-card nv-reveal">
              <div className="evento-card__icon">
                <Icon name={icon} size={34} />
              </div>
              <h3 className="evento-card__title">{titulo}</h3>
              <p className="evento-card__time">{local.horario}</p>
              <p className="evento-card__address">
                {local.linhas.map((linha) => (
                  <span key={linha}>{linha}</span>
                ))}
              </p>
              <MapsLink href={local.maps}>Como chegar</MapsLink>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
