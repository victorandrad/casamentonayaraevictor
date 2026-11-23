import { Icon, locais, MapsLink, SectionHeader, useConvite, type IconName } from '@nv/shared';
import type { LocalEvento } from '@nv/shared/types';
import './evento.css';

export default function Evento() {
  // The reception only shows up for invites marked for it (the API sends its address with the invite).
  const convite = useConvite();
  const recepcao = convite?.recepcao ?? null;
  // Guests whose invite is for the ceremony only get a note about when to greet the couple.
  const soCerimonia = convite != null && recepcao == null;
  const cards: Array<{ icon: IconName; titulo: string; local: LocalEvento }> = [
    { icon: 'church', titulo: 'Cerimônia', local: locais.cerimonia },
    ...(recepcao ? [{ icon: 'cheers' as const, titulo: 'Recepção', local: recepcao }] : []),
  ];

  return (
    <section id="evento" className="nv-section">
      <div className="nv-container">
        <SectionHeader eyebrow="O grande dia" title={recepcao ? 'Cerimônia & Recepção' : 'Cerimônia'} />
        <div className={cards.length === 1 ? 'evento-grid evento-grid--um' : 'evento-grid'}>
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
        {soCerimonia && (
          <p className="evento-aviso nv-reveal">Os noivos receberão os cumprimentos após a cerimônia.</p>
        )}
      </div>
    </section>
  );
}
