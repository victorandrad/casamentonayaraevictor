import { locais, MapsLink, salvarConsentimento, SectionHeader, useConsentimento } from '@nv/shared';
import './evento.css';

export default function Local() {
  // The Google embed sets Google's cookies: it only loads once the guest allows it.
  const consentimento = useConsentimento();
  return (
    <section id="local" className="nv-section">
      <div className="nv-container">
        <SectionHeader eyebrow="Como chegar" title="Local" />
        <div className="local-grid">
          {consentimento === 'todos' ? (
            <iframe
              title="Recanto Espelho da Lua no mapa"
              src={locais.recepcao.embed}
              className="local-map"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="local-map local-map--bloqueado">
              <p>O mapa é carregado do Google, que pode usar cookies próprios.</p>
              <button className="nv-btn-outline" onClick={() => salvarConsentimento('todos')}>
                Permitir e mostrar o mapa
              </button>
            </div>
          )}
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
