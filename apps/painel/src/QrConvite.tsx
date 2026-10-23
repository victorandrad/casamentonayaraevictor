import { useEffect, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import type { ConvidadoAdmin } from '@nv/shared/types';
import { inviteLink } from './adminApi';

// QR code for the printed invitation. It opens the site with the invite
// already identified (/#convite=CODE), so the guest lands on the RSVP form.

function gerarQr(texto: string) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr;
}

export function qrSvg(texto: string, margem = 2) {
  return gerarQr(texto).createSvgTag({ cellSize: 8, margin: margem * 8, scalable: true });
}

// High-resolution PNG (good for print shops), drawn module by module.
function baixarPng(texto: string, nomeArquivo: string) {
  const qr = gerarQr(texto);
  const modulos = qr.getModuleCount();
  const margem = 4;
  const escala = Math.ceil(1200 / (modulos + margem * 2));
  const lado = (modulos + margem * 2) * escala;
  const canvas = Object.assign(document.createElement('canvas'), { width: lado, height: lado });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.fillStyle = '#43382f';
  for (let y = 0; y < modulos; y++) {
    for (let x = 0; x < modulos; x++) {
      if (qr.isDark(y, x)) ctx.fillRect((x + margem) * escala, (y + margem) * escala, escala, escala);
    }
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: nomeArquivo }).click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

const slug = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export function QrConviteModal({ convidado, onFechar }: { convidado: ConvidadoAdmin; onFechar: () => void }) {
  const link = inviteLink(convidado.codigo);
  const svg = useMemo(() => qrSvg(link), [link]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar]);

  return (
    <div className="qr-overlay" onClick={onFechar}>
      <div className="qr-modal" role="dialog" aria-modal="true" aria-label={`QR Code de ${convidado.nome}`} onClick={(e) => e.stopPropagation()}>
        <button className="qr-modal__fechar" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
        <h3 className="painel-h3">QR Code do convite</h3>
        <p className="painel-hint">Para imprimir no convite de {convidado.nome}. Ao escanear, o site abre com o convite identificado.</p>
        <div className="qr-modal__codigo" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="qr-modal__nome">{convidado.nome}</p>
        <p className="qr-modal__code">
          <code>{convidado.codigo}</code>
        </p>
        <p className="qr-modal__link">{link}</p>
        <div className="qr-modal__acoes">
          <button className="nv-btn" onClick={() => baixarPng(link, `convite-${slug(convidado.nome)}-${convidado.codigo}.png`)}>
            Baixar PNG
          </button>
          <button className="nv-btn-ghost" onClick={() => imprimirFolhaQr([convidado])}>
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Printable sheet with one card per guest: QR, name and code to type.
export function imprimirFolhaQr(convidados: ConvidadoAdmin[]) {
  const janela = window.open('', '_blank');
  if (!janela) {
    alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.');
    return;
  }
  const cards = convidados
    .map(
      (c) => `
      <div class="card">
        <div class="qr">${qrSvg(inviteLink(c.codigo), 1)}</div>
        <div class="nome">${escapar(c.nome)}</div>
        <div class="codigo">${escapar(c.codigo)}</div>
        <div class="dica">Escaneie ou digite o código em ${escapar(location.host)}</div>
      </div>`,
    )
    .join('');
  janela.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>QR Codes dos convites · Nayara & Victor</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #43382f; }
  h1 { font-weight: normal; font-size: 18px; margin: 0 0 10px; }
  .grade { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
  .card { border: 1px dashed #d9c8b6; border-radius: 6mm; padding: 6mm 4mm; text-align: center; break-inside: avoid; }
  .qr svg { width: 38mm; height: 38mm; }
  .qr svg rect[fill="#000000"], .qr svg path { fill: #43382f; }
  .nome { font-size: 14px; margin-top: 3mm; }
  .codigo { font-family: 'Courier New', monospace; font-size: 15px; letter-spacing: 2px; margin-top: 1.5mm; }
  .dica { font-family: Arial, sans-serif; font-size: 8.5px; color: #8c7d6f; margin-top: 2mm; }
  @media screen { body { padding: 20px; background: #f6f1ea; } .card { background: #fff; } }
</style></head>
<body>
  <h1>QR Codes dos convites · ${convidados.length} convite(s)</h1>
  <div class="grade">${cards}</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  janela.document.close();
}
