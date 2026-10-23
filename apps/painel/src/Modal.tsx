import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

type ModalProps = {
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  // When set, the body is a <form> and Enter submits it.
  onSubmit?: (e: FormEvent) => void;
  largura?: 'normal' | 'larga';
  bloqueado?: boolean; // while saving: no closing by Esc/backdrop
};

// Panel dialog used for every create / edit / delete action.
export function Modal({ titulo, subtitulo, onFechar, children, rodape, onSubmit, largura = 'normal', bloqueado }: ModalProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const bloqueadoRef = useRef(bloqueado);
  bloqueadoRef.current = bloqueado;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first field (or the dialog itself) for keyboard users.
    const primeiro = caixa.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]), select, textarea');
    (primeiro ?? caixa.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bloqueadoRef.current) fecharRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, []);

  const conteudo = (
    <>
      <div className="painel-modal__corpo">{children}</div>
      {rodape && <div className="painel-modal__rodape">{rodape}</div>}
    </>
  );

  return (
    <div className="painel-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !bloqueado && onFechar()}>
      <div
        ref={caixa}
        className={`painel-modal painel-modal--${largura}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="painel-modal-titulo"
        tabIndex={-1}
      >
        <header className="painel-modal__topo">
          <div>
            <h2 id="painel-modal-titulo" className="painel-modal__titulo">
              {titulo}
            </h2>
            {subtitulo && <p className="painel-modal__subtitulo">{subtitulo}</p>}
          </div>
          <button type="button" className="painel-modal__fechar" onClick={onFechar} disabled={bloqueado} aria-label="Fechar">
            ×
          </button>
        </header>
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate>
            {conteudo}
          </form>
        ) : (
          conteudo
        )}
      </div>
    </div>
  );
}

type ConfirmarProps = {
  titulo: string;
  mensagem: ReactNode;
  confirmar: string;
  onConfirmar: () => Promise<void>;
  onFechar: () => void;
};

// Destructive confirmation (replaces window.confirm). Keeps the dialog open and
// shows the error if the action fails.
export function ConfirmarModal({ titulo, mensagem, confirmar, onConfirmar, onFechar }: ConfirmarProps) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const executar = async () => {
    setEnviando(true);
    setErro('');
    try {
      await onConfirmar();
      onFechar();
    } catch (error) {
      setErro((error as Error).message || 'Não foi possível concluir. Tente novamente.');
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={titulo}
      onFechar={onFechar}
      bloqueado={enviando}
      rodape={
        <>
          <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="nv-btn painel-btn-perigo" onClick={executar} disabled={enviando}>
            {enviando ? 'Aguarde…' : confirmar}
          </button>
        </>
      }
    >
      <div className="painel-modal__mensagem">{mensagem}</div>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}
