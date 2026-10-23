import { locais, MapsLink, SectionHeader } from '@nv/shared';
import './evento.css';

export default function Local() {
  return (
    <section id="local" className="nv-section">
      <div className="nv-container">
        <SectionHeader eyebrow="Como chegar" title="Local" />
        <div className="local-grid">
          <iframe
            title="Recanto Espelho da Lua no mapa"
            src={locais.recepcao.embed}
            className="local-map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div>
            <h3 className="local-title">Cerimônia</h3>
            <p className="local-text">{locais.cerimonia.descricao}</p>
            <h3 className="local-title">Recepção</h3>
            <p className="local-text">{locais.recepcao.descricao}</p>
            <div className="local-links">
              <MapsLink href={locais.cerimonia.maps}>Cerimônia</MapsLink>
              <MapsLink href={locais.recepcao.maps}>Recepção</MapsLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
