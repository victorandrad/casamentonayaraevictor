import { useRef, useState } from 'react';
import { Icon } from '@nv/shared';
import { enviarFoto } from './adminApi';

const LIMITE_MB = 10;

// Photo field (gifts and gallery): pick a file, it uploads right away and shows a preview.
export function FotoUpload({
  value,
  onChange,
  tipo = 'presente',
  removivel = true,
}: {
  value: string;
  onChange: (url: string) => void;
  tipo?: 'presente' | 'galeria';
  removivel?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro('');
    if (arquivo.size > LIMITE_MB * 1024 * 1024) {
      setErro(`A imagem passa de ${LIMITE_MB} MB.`);
      return;
    }
    setEnviando(true);
    try {
      onChange(await enviarFoto(arquivo, tipo));
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="foto-upload">
      <button
        type="button"
        className={value ? 'foto-upload__preview has-foto' : 'foto-upload__preview'}
        onClick={() => input.current?.click()}
        disabled={enviando}
        aria-label={value ? 'Trocar foto' : 'Enviar foto'}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          escolher(e.dataTransfer.files[0]);
        }}
      >
        {value ? <img src={value} alt="" /> : <Icon name="camera" size={26} />}
        {enviando && <span className="foto-upload__loading">Enviando…</span>}
      </button>
      <div className="foto-upload__info">
        <button type="button" className="painel-link" onClick={() => input.current?.click()} disabled={enviando}>
          {value ? 'Trocar foto' : 'Enviar foto'}
        </button>
        {value && !enviando && removivel && (
          <button type="button" className="painel-link painel-link--danger" onClick={() => onChange('')}>
            Remover
          </button>
        )}
        <span className="foto-upload__hint">JPG, PNG, WebP ou HEIC · até {LIMITE_MB} MB</span>
        {erro && (
          <span className="foto-upload__erro" role="alert">
            {erro}
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        hidden
        onChange={(e) => escolher(e.target.files?.[0])}
      />
    </div>
  );
}
