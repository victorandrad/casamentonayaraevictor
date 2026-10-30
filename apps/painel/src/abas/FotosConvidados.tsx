import { useMemo, useState } from 'react';
import { casamento, EstadoVazio } from '@nv/shared';
import { errorMessage } from '@nv/shared/api';
import type { FotosConvidadosAdmin, MidiaConvidadoAdmin, ModoFotosConvidados } from '@nv/shared/types';
import { adminApi, copyText, formatDate } from '../adminApi';
import { useLoad } from '../useLoad';
import { Paginacao, usePaginacao } from '../Paginacao';
import { ConfirmarModal } from '../Modal';
import { baixarPng, qrSvg } from '../QrConvite';

const carregar = () => adminApi<FotosConvidadosAdmin>('/admin/fotos-convidados');
const linkFotos = () => `${location.origin}/fotos`;

const MODOS: Array<{ id: ModoFotosConvidados; label: string; dica: string }> = [
  { id: 'automatico', label: 'Automático', dica: `Abre sozinho no dia do casamento (${casamento.dataExtenso}) e fica aberto.` },
  { id: 'aberto', label: 'Aberto', dica: 'Os convidados podem enviar desde já.' },
  { id: 'fechado', label: 'Fechado', dica: 'Ninguém envia; o que já chegou continua no site.' },
];

type Filtro = 'todas' | 'site' | 'ocultas';

function tamanho(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// A4 sheet with four cards to stand on the tables: QR code and a short invitation to share.
function imprimirCartoesMesa() {
  const janela = window.open('', '_blank');
  if (!janela) {
    alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.');
    return;
  }
  const link = linkFotos();
  const cartao = `
    <div class="card">
      <div class="olho">Pelos seus olhos</div>
      <div class="titulo">Compartilhe suas fotos da festa!</div>
      <div class="qr">${qrSvg(link, 1)}</div>
      <div class="texto">Aponte a câmera do celular para o código e envie as fotos e vídeos que você fizer hoje.</div>
      <div class="link">${escapar(link.replace(/^https?:\/\//, ''))}</div>
      <div class="nomes">${escapar(casamento.noiva)} &amp; ${escapar(casamento.noivo)}</div>
    </div>`;
  janela.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Cartões das mesas · Fotos dos convidados</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #43382f; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .card { height: 132mm; border: 1px dashed #d9c8b6; border-radius: 6mm; padding: 9mm 7mm; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; break-inside: avoid; }
  .olho { font-style: italic; color: #c58a83; font-size: 15px; }
  .titulo { font-size: 20px; margin: 2mm 0 5mm; line-height: 1.25; }
  .qr svg { width: 52mm; height: 52mm; }
  .qr svg rect[fill="#000000"], .qr svg path { fill: #43382f; }
  .texto { font-family: Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6b5e52; margin-top: 4mm; max-width: 70mm; }
  .link { font-family: 'Courier New', monospace; font-size: 11px; margin-top: 3mm; }
  .nomes { margin-top: 5mm; font-size: 13px; letter-spacing: 2px; color: #8c7d6f; }
  @media screen { body { padding: 20px; background: #f6f1ea; } .card { background: #fff; } }
</style></head>
<body>
  <div class="grade">${cartao.repeat(4)}</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  janela.document.close();
}

export function FotosConvidados() {
  const { data, setData, erro, setErro } = useLoad(carregar);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [excluindo, setExcluindo] = useState<MidiaConvidadoAdmin | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [mudandoModo, setMudandoModo] = useState(false);
  const itens = useMemo(() => data?.itens ?? [], [data]);
  const filtrados = useMemo(
    () => itens.filter((m) => (filtro === 'todas' ? true : filtro === 'site' ? m.visivel : !m.visivel)),
    [itens, filtro],
  );
  const paginacao = usePaginacao(filtrados, { porPaginaInicial: 25, reiniciarQuando: [filtro] });
  const svg = useMemo(() => qrSvg(linkFotos()), []);

  const fotos = itens.filter((m) => m.tipo === 'foto').length;
  const videos = itens.length - fotos;
  const espaco = itens.reduce((soma, m) => soma + m.bytes, 0);
  const ocultas = itens.filter((m) => !m.visivel).length;

  const mudarModo = async (modo: ModoFotosConvidados) => {
    setMudandoModo(true);
    try {
      setData(await adminApi<FotosConvidadosAdmin>('/admin/fotos-convidados/modo', { method: 'PUT', body: { modo } }));
    } catch (error) {
      setErro(errorMessage(error));
    } finally {
      setMudandoModo(false);
    }
  };

  const alternar = async (m: MidiaConvidadoAdmin) => {
    try {
      const atualizado = await adminApi<MidiaConvidadoAdmin>(`/admin/fotos-convidados/${m.id}`, { method: 'PATCH', body: { visivel: !m.visivel } });
      setData((d) => d && { ...d, itens: d.itens.map((x) => (x.id === m.id ? atualizado : x)) });
    } catch (error) {
      setErro(errorMessage(error));
    }
  };

  const copiar = async () => {
    if (await copyText(linkFotos())) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  return (
    <section>
      <div className="painel-section-head">
        <h2 className="painel-h2">Fotos dos convidados</h2>
        <div className="painel-head-acoes">
          {itens.some((m) => m.visivel && m.estado === 'pronto') && (
            <a className="nv-btn-ghost" href="/api/admin/fotos-convidados/todas.zip" download>
              Baixar todas (.zip)
            </a>
          )}
        </div>
      </div>
      <p className="painel-hint">
        Fotos e vídeos que os convidados enviam pelo celular na página <strong>/fotos</strong>. Aparecem no site na hora; aqui vocês ocultam ou excluem o que quiserem.
      </p>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      {!data && !erro && <p className="painel-empty">Carregando…</p>}

      {data && (
        <div className="fotos-conv__topo">
          <div className="painel-card fotos-conv__card">
            <h3 className="painel-h3">
              Envio pelos convidados{' '}
              <span className={data.aberto ? 'painel-badge painel-badge--sim' : 'painel-badge painel-badge--nao'}>{data.aberto ? 'Aberto agora' : 'Fechado agora'}</span>
            </h3>
            <div className="fotos-conv__modos" role="radiogroup" aria-label="Quando os convidados podem enviar">
              {MODOS.map((m) => (
                <label key={m.id} className={data.modo === m.id ? 'fotos-conv__modo is-ativo' : 'fotos-conv__modo'}>
                  <input type="radio" name="modo-fotos" checked={data.modo === m.id} disabled={mudandoModo} onChange={() => mudarModo(m.id)} />
                  <span>
                    <strong>{m.label}</strong>
                    <small>{m.dica}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="painel-card fotos-conv__card fotos-conv__qr">
            <div className="fotos-conv__qr-codigo" dangerouslySetInnerHTML={{ __html: svg }} />
            <div>
              <h3 className="painel-h3">QR code para as mesas</h3>
              <p className="painel-hint">Leva direto à página de envio. Imprima os cartões e deixe um em cada mesa.</p>
              <p className="fotos-conv__link">{linkFotos()}</p>
              <div className="fotos-conv__acoes">
                <button className="nv-btn" onClick={imprimirCartoesMesa}>
                  Imprimir cartões
                </button>
                <button className="nv-btn-ghost" onClick={() => baixarPng(linkFotos(), 'qr-fotos-dos-convidados.png')}>
                  Baixar PNG
                </button>
                <button className="nv-btn-ghost" onClick={copiar}>
                  {copiado ? '✓ Copiado' : 'Copiar link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {data && itens.length === 0 && (
        <EstadoVazio icon="images" titulo="Nenhuma foto ainda">
          Quando os convidados enviarem fotos e vídeos, eles aparecem aqui.
        </EstadoVazio>
      )}

      {itens.length > 0 && (
        <>
          <div className="painel-toolbar">
            <p className="fotos-conv__resumo">
              {fotos} foto{fotos === 1 ? '' : 's'} · {videos} vídeo{videos === 1 ? '' : 's'} · {tamanho(espaco)}
            </p>
            <div className="fotos-conv__filtros" role="group" aria-label="Filtrar">
              {(
                [
                  ['todas', 'Todas'],
                  ['site', 'No site'],
                  ['ocultas', `Ocultas (${ocultas})`],
                ] as const
              ).map(([id, label]) => (
                <button key={id} className={filtro === id ? 'painel-chip is-active' : 'painel-chip'} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ul className="fotos-conv__grade">
            {paginacao.visiveis.map((m) => (
              <li key={m.id} className={m.visivel ? 'fotos-conv__item' : 'fotos-conv__item is-oculta'}>
                <a className="fotos-conv__miniatura" href={m.url ?? undefined} target="_blank" rel="noopener" aria-label="Abrir em tamanho real">
                  {m.miniatura ? <img src={m.miniatura} alt="" loading="lazy" /> : <span className="fotos-conv__sem">{m.estado === 'processando' ? 'Convertendo…' : 'Não foi possível converter'}</span>}
                  {m.tipo === 'video' && m.duracao !== null && <span className="fotos-conv__duracao">▶ {Math.round(m.duracao)}s</span>}
                </a>
                <div className="fotos-conv__corpo">
                  <div className="fotos-conv__nome">
                    {m.nome || <em>Sem nome</em>}
                    {!m.visivel && <span className="painel-badge painel-badge--nao">Oculta</span>}
                    {m.estado === 'falhou' && <span className="painel-badge painel-badge--nao">Falhou</span>}
                    {m.estado === 'processando' && <span className="painel-badge painel-badge--pendente">Convertendo</span>}
                  </div>
                  <div className="fotos-conv__meta">
                    {formatDate(m.criadoEm)} · {new Date(m.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="fotos-conv__acoes-item">
                    {m.estado === 'pronto' && (
                      <button className="painel-link" onClick={() => alternar(m)}>
                        {m.visivel ? 'Ocultar' : 'Mostrar no site'}
                      </button>
                    )}
                    <button className="painel-link painel-link--danger" onClick={() => setExcluindo(m)}>
                      Excluir
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Paginacao {...paginacao} rotulo="itens" tamanhos={[25, 50, 100]} />
        </>
      )}

      {excluindo && (
        <ConfirmarModal
          titulo={excluindo.tipo === 'video' ? 'Excluir vídeo' : 'Excluir foto'}
          mensagem={
            <>
              {excluindo.miniatura && <img className="galeria-editar__previa galeria-editar__previa--pequena" src={excluindo.miniatura} alt="" />}
              Excluir {excluindo.tipo === 'video' ? 'este vídeo' : 'esta foto'}
              {excluindo.nome ? ` de ${excluindo.nome}` : ''}? O arquivo é apagado e isso não pode ser desfeito.
              {excluindo.visivel && ' Para só tirar do site, use “Ocultar”.'}
            </>
          }
          confirmar="Excluir"
          onConfirmar={async () => {
            await adminApi(`/admin/fotos-convidados/${excluindo.id}`, { method: 'DELETE' });
            setData((d) => d && { ...d, itens: d.itens.filter((x) => x.id !== excluindo.id) });
          }}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </section>
  );
}
