import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { MidiaConvidado } from '@nv/shared/types';

type Props = {
  itens: MidiaConvidado[];
  indice: number;
  onMudar: (i: number) => void;
  onFechar: () => void;
  // Only on what was sent from this phone.
  podeExcluir: (uid: string) => boolean;
  onExcluir: (uid: string) => Promise<void>;
};

function quando(iso: string) {
  const data = new Date(iso);
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return data.toDateString() === new Date().toDateString() ? `às ${hora}` : `em ${data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${hora}`;
}

// Full screen, one at a time: arrows, keyboard (← → Esc) and swipe. Videos play with their controls.
export function VisorMidia({ itens, indice, onMudar, onFechar, podeExcluir, onExcluir }: Props) {
  const fechar = useRef<HTMLButtonElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');
  const atual = itens[indice];

  const ir = (passo: 1 | -1) => {
    const para = indice + passo;
    if (para >= 0 && para < itens.length) onMudar(para);
  };

  useEffect(() => {
    setConfirmando(false);
    setErro('');
  }, [indice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
      if (e.key === 'ArrowRight') ir(1);
      if (e.key === 'ArrowLeft') ir(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fechar.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // The neighbouring photos load ahead, so swiping doesn't wait.
  useEffect(() => {
    for (const m of [itens[indice - 1], itens[indice + 1]]) if (m?.tipo === 'foto') new Image().src = m.url;
  }, [indice, itens]);

  if (!atual) return null;

  const inicioToque = (e: PointerEvent) => {
    toque.current = { x: e.clientX, y: e.clientY };
  };
  const fimToque = (e: PointerEvent) => {
    if (!toque.current) return;
    const dx = e.clientX - toque.current.x;
    const dy = e.clientY - toque.current.y;
    toque.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1);
  };

  const excluir = async () => {
    if (!confirmando) return setConfirmando(true);
    setExcluindo(true);
    try {
      await onExcluir(atual.uid);
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setExcluindo(false);
      setConfirmando(false);
    }
  };

  const descricao = atual.tipo === 'video' ? 'Vídeo' : 'Foto';

  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label={`${descricao} ${indice + 1} de ${itens.length}`} onClick={onFechar}>
      <button ref={fechar} className="visor__fechar" onClick={onFechar} aria-label="Fechar">
        ×
      </button>

      <div className="visor__palco" onClick={(e) => e.stopPropagation()} onPointerDown={inicioToque} onPointerUp={fimToque}>
        {indice > 0 && (
          <button className="visor__nav visor__nav--ant" onClick={() => ir(-1)} aria-label="Anterior">
            ‹
          </button>
        )}
        {atual.tipo === 'video' ? (
          <video key={atual.uid} className="visor__midia" src={atual.url} poster={atual.miniatura} controls playsInline autoPlay preload="metadata" />
        ) : (
          <img key={atual.uid} className="visor__midia" src={atual.url} alt={atual.nome ? `Foto enviada por ${atual.nome}` : 'Foto de um convidado'} draggable={false} />
        )}
        {indice < itens.length - 1 && (
          <button className="visor__nav visor__nav--prox" onClick={() => ir(1)} aria-label="Próxima">
            ›
          </button>
        )}
      </div>

      <div className="visor__rodape" onClick={(e) => e.stopPropagation()}>
        <p className="visor__legenda">
          {atual.nome ? (
            <>
              Enviada por <strong>{atual.nome}</strong> {quando(atual.criadoEm)}
            </>
          ) : (
            <>Enviada {quando(atual.criadoEm)}</>
          )}
          <span className="visor__contagem"> · {indice + 1} de {itens.length}</span>
        </p>
        {podeExcluir(atual.uid) && (
          <button className={confirmando ? 'visor__excluir is-confirmando' : 'visor__excluir'} onClick={excluir} disabled={excluindo}>
            {excluindo ? 'Excluindo…' : confirmando ? `Excluir mesmo? Toque de novo` : `Excluir ${atual.tipo === 'video' ? 'meu vídeo' : 'minha foto'}`}
          </button>
        )}
        {erro && (
          <p className="visor__erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
