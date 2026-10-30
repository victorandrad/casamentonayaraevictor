import { useEffect, useState } from 'react';
import { Icon, navegar, SectionHeader } from '@nv/shared';
import type { FotosConvidados } from '@nv/shared/types';
import { carregarFotosConvidados } from './envioFotos';
import './fotosConvidados.css';

const NA_PREVIA = 8;

// On the home page: the latest guests' photos and the way to send yours. Shows up only once the
// sending is open or there is something to see (before the wedding, nothing).
export default function PreviaFotosConvidados() {
  const [dados, setDados] = useState<FotosConvidados | null>(null);

  useEffect(() => {
    carregarFotosConvidados()
      .then(setDados)
      .catch(() => {});
  }, []);

  if (!dados || (!dados.aberto && dados.itens.length === 0)) return null;

  const abrir = (e: React.MouseEvent) => {
    e.preventDefault();
    navegar('/fotos');
  };

  return (
    <section id="fotos-convidados" className="nv-section">
      <div className="nv-container--wide">
        <SectionHeader eyebrow="Pelos seus olhos" title="Fotos dos convidados" />
        {dados.itens.length > 0 ? (
          <ul className="fotos-grade fotos-grade--previa">
            {dados.itens.slice(0, NA_PREVIA).map((m) => (
              <li key={m.uid}>
                <a className="fotos-grade__item" href="/fotos" onClick={abrir} aria-label={`${m.tipo === 'video' ? 'Vídeo' : 'Foto'}${m.nome ? ` de ${m.nome}` : ''}`}>
                  <img src={m.miniatura} alt="" loading="lazy" draggable={false} />
                  {m.tipo === 'video' && (
                    <span className="fotos-grade__video" aria-hidden>
                      <Icon name="play" size={14} />
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fotos-previa__texto">Fotografou ou filmou um momento da festa? Compartilhe com a gente!</p>
        )}
        <div className="fotos-previa__acoes">
          {dados.aberto && (
            <a className="nv-btn" href="/fotos" onClick={abrir}>
              <Icon name="upload" size={16} /> Enviar minhas fotos
            </a>
          )}
          {dados.itens.length > 0 && (
            <a className={dados.aberto ? 'nv-btn-outline' : 'nv-btn'} href="/fotos" onClick={abrir}>
              Ver todas
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
