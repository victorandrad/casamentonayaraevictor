import { useEffect, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { parseCode } from './storage';

const READER_ID = 'nv-leitor-convite';

// Camera reader for the QR printed on the invitation. Accepts the invite link
// (…/#convite=NV-XXXX) or a plain code, and hands the code back to the RSVP form.
export function LeitorConvite({ onCodigo, onFechar }: { onCodigo: (codigo: string) => void; onFechar: () => void }) {
  const [erro, setErro] = useState('');
  const [ligada, setLigada] = useState(false);
  const lido = useRef(false);

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let cancelado = false;

    import('html5-qrcode')
      .then(({ Html5Qrcode }) => {
        if (cancelado) return;
        scanner = new Html5Qrcode(READER_ID);
        return scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 220 },
          (texto) => {
            if (lido.current) return;
            const codigo = parseCode(texto);
            if (!/^[A-Za-z0-9-]{3,20}$/.test(codigo)) return;
            lido.current = true;
            navigator.vibrate?.(60);
            onCodigo(codigo.toUpperCase());
          },
          () => {},
        );
      })
      .then(() => {
        // Closed before the camera permission was granted: turn it off again.
        if (cancelado) scanner?.stop().then(() => scanner?.clear()).catch(() => {});
        else setLigada(true);
      })
      .catch(() => setErro('Não foi possível abrir a câmera. Permita o acesso à câmera ou digite o código do convite.'));

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', onKey);
    return () => {
      cancelado = true;
      window.removeEventListener('keydown', onKey);
      if (scanner?.isScanning) scanner.stop().then(() => scanner?.clear()).catch(() => {});
    };
  }, []);

  return (
    <div className="leitor-overlay" onClick={onFechar}>
      <div className="leitor" role="dialog" aria-modal="true" aria-label="Ler QR Code do convite" onClick={(e) => e.stopPropagation()}>
        <button className="leitor__fechar" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
        <p className="leitor__titulo">Aponte a câmera para o QR Code do convite</p>
        <div id={READER_ID} className="leitor__camera" />
        {!ligada && !erro && <p className="leitor__aviso">Permita o acesso à câmera quando o navegador pedir.</p>}
        {erro && (
          <p className="rsvp-error" role="alert">
            {erro}
          </p>
        )}
        <button className="nv-btn-ghost" onClick={onFechar}>
          Digitar o código
        </button>
      </div>
    </div>
  );
}
