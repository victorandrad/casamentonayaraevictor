import { useEffect, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import type { Checkin } from '@nv/shared/types';
import { consultarCheckin, parseCode } from './storage';

type Result = { code: string; presenca: Checkin | null };

const READER_ID = 'nv-qr-reader';

function describe(result: Result) {
  const status = result.presenca?.status;
  if (!result.presenca) return { bg: '#7a5a55', icon: '❓', label: 'Código fora da lista' };
  if (status === 'sim') {
    const extra = result.presenca.acompanhantes ? ` · +${result.presenca.acompanhantes}` : '';
    return { bg: '#6f8a5a', icon: '✓', label: `Presença confirmada${extra}` };
  }
  if (status === 'nao') return { bg: '#a15b52', icon: '✕', label: 'Marcado como ausente' };
  return { bg: '#a8895a', icon: '⏳', label: 'Convite válido · sem confirmação' };
}

export function Scanner({ onClose }: { onClose: () => void }) {
  const [erro, setErro] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const lastScan = useRef<string | null>(null);

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let cancelled = false;

    // Loaded on demand: only the entrance device ever opens the scanner.
    import('html5-qrcode')
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;
        scanner = new Html5Qrcode(READER_ID);
        return scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 240 },
          (decoded) => {
            const code = parseCode(decoded);
            if (code === lastScan.current) return;
            lastScan.current = code;
            consultarCheckin(code)
              .then((presenca) => setResult({ code, presenca }))
              .catch(() => setResult({ code, presenca: null }));
            navigator.vibrate?.(80);
          },
          () => {},
        );
      })
      .catch(() => setErro('Não foi possível acessar a câmera. Use um celular e permita o acesso à câmera.'));

    return () => {
      cancelled = true;
      if (scanner?.isScanning) scanner.stop().then(() => scanner?.clear()).catch(() => {});
    };
  }, []);

  const view = result && describe(result);

  return (
    <div className="portaria portaria--scanner">
      <p className="portaria__kicker">Portaria · Nayara &amp; Victor</p>
      <h3 className="portaria__title">Leitor de convites</h3>
      {erro && <p className="portaria__error">{erro}</p>}
      <div id={READER_ID} className="portaria__reader" />
      {result && view && (
        <div className="portaria__result nv-fade-up" style={{ background: view.bg }}>
          <div className="portaria__result-icon">{view.icon}</div>
          <p className="portaria__result-name">{result.presenca?.nome ?? 'Convite não encontrado'}</p>
          <p className="portaria__result-label">{view.label}</p>
          <p className="portaria__result-code">{result.code}</p>
        </div>
      )}
      <button className="portaria__btn" onClick={onClose}>
        Fechar leitor
      </button>
    </div>
  );
}
