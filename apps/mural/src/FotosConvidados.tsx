import { useCallback, useEffect, useRef, useState } from 'react';
import { EstadoVazio, Icon, navegar } from '@nv/shared';
import { errorMessage } from '@nv/shared/api';
import type { FotosConvidados as Dados, MidiaConvidado } from '@nv/shared/types';
import { carregarFotosConvidados, enviarArquivo, excluirMinha, formatarDuracao, minhas, nomeSalvo, salvarNome, tipoDoArquivo } from './envioFotos';
import { VisorMidia } from './VisorMidia';
import './fotosConvidados.css';

type ItemFila = {
  id: number;
  arquivo: File;
  tipo: 'foto' | 'video';
  previa: string | null;
  estado: 'fila' | 'enviando' | 'pronto' | 'processando' | 'erro';
  progresso: number;
  erro?: string;
};

let proximoId = 1;
const ATUALIZAR_MS = 30_000;

// What guests saw at the party, sent from their phones (QR code on the tables leads here). Anyone
// with the link can send while it's open; what arrives shows up for everyone right away.
export default function FotosConvidados() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroLista, setErroLista] = useState('');
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [nome, setNome] = useState(nomeSalvo);
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [meus, setMeus] = useState(minhas);
  const [aberta, setAberta] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const nomeAtual = useRef(nome);
  const enviando = useRef(false);
  const paginas = useRef(1);
  nomeAtual.current = nome;

  useEffect(() => {
    document.title = 'Fotos dos convidados · Nayara & Victor';
  }, []);

  // The first page again, keeping whatever older pages were already loaded below it.
  const recarregar = useCallback(async () => {
    try {
      const novo = await carregarFotosConvidados();
      setErroLista('');
      setDados((atual) => {
        if (!atual || paginas.current === 1) return novo;
        const vistos = new Set(novo.itens.map((m) => m.uid));
        const ultimo = novo.itens[novo.itens.length - 1]?.criadoEm ?? '';
        const antigos = atual.itens.filter((m) => !vistos.has(m.uid) && m.criadoEm < ultimo);
        return { ...novo, itens: [...novo.itens, ...antigos], proxima: atual.proxima };
      });
    } catch (error) {
      setErroLista(errorMessage(error));
    }
  }, []);

  // New photos keep arriving during the party: refresh while the page is in view.
  useEffect(() => {
    recarregar();
    const t = setInterval(() => document.visibilityState === 'visible' && recarregar(), ATUALIZAR_MS);
    return () => clearInterval(t);
  }, [recarregar]);

  const carregarMais = async () => {
    if (!dados?.proxima) return;
    setCarregandoMais(true);
    try {
      const mais = await carregarFotosConvidados(dados.proxima);
      paginas.current += 1;
      setDados((atual) => atual && { ...atual, itens: [...atual.itens, ...mais.itens.filter((m) => !atual.itens.some((a) => a.uid === m.uid))], proxima: mais.proxima });
    } catch (error) {
      setErroLista(errorMessage(error));
    } finally {
      setCarregandoMais(false);
    }
  };

  const mudar = (id: number, mudanca: Partial<ItemFila>) => setFila((f) => f.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));

  // One file at a time, in the order chosen.
  useEffect(() => {
    if (enviando.current) return;
    const item = fila.find((i) => i.estado === 'fila');
    if (!item) return;
    enviando.current = true;
    mudar(item.id, { estado: 'enviando', progresso: 0 });
    enviarArquivo(item.arquivo, nomeAtual.current, (p) => mudar(item.id, { progresso: p }))
      .then((r) => {
        mudar(item.id, { estado: r.estado, progresso: 1 });
        setMeus(minhas());
        if (r.estado === 'pronto') recarregar();
      })
      .catch((error) => mudar(item.id, { estado: 'erro', erro: errorMessage(error) }))
      .finally(() => {
        enviando.current = false;
        setFila((f) => [...f]);
      });
  }, [fila, recarregar]);

  // A converted video shows up in the feed on the next refresh.
  const temProcessando = fila.some((i) => i.estado === 'processando');
  useEffect(() => {
    if (!temProcessando) return;
    const t = setTimeout(recarregar, 15_000);
    return () => clearTimeout(t);
  }, [temProcessando, dados, recarregar]);

  const pendentes = fila.some((i) => i.estado === 'fila' || i.estado === 'enviando');
  useEffect(() => {
    if (!pendentes) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [pendentes]);

  // Previews of the photos in the queue are object URLs: freed when the page goes.
  const filaAtual = useRef(fila);
  filaAtual.current = fila;
  useEffect(() => () => filaAtual.current.forEach((i) => i.previa && URL.revokeObjectURL(i.previa)), []);

  const escolher = (lista: FileList | null) => {
    if (!lista?.length) return;
    const novos: ItemFila[] = [];
    for (const arquivo of Array.from(lista)) {
      const tipo = tipoDoArquivo(arquivo);
      novos.push({
        id: proximoId++,
        arquivo,
        tipo: tipo ?? 'foto',
        previa: tipo === 'foto' ? URL.createObjectURL(arquivo) : null,
        estado: tipo ? 'fila' : 'erro',
        progresso: 0,
        erro: tipo ? undefined : 'Esse arquivo não é foto nem vídeo.',
      });
    }
    setFila((f) => [...f, ...novos]);
    if (input.current) input.current.value = '';
  };

  const tentarDeNovo = (id: number) => mudar(id, { estado: 'fila', erro: undefined, progresso: 0 });
  const limparConcluidos = () =>
    setFila((f) =>
      f.filter((i) => {
        const fica = i.estado === 'fila' || i.estado === 'enviando' || i.estado === 'erro';
        if (!fica && i.previa) URL.revokeObjectURL(i.previa);
        return fica;
      }),
    );

  const excluir = async (uid: string) => {
    await excluirMinha(uid);
    setMeus(minhas());
    const restantes = itens.length - 1;
    setAberta((i) => (i === null || restantes === 0 ? null : Math.min(i, restantes - 1)));
    setDados((atual) => atual && { ...atual, itens: atual.itens.filter((m) => m.uid !== uid) });
  };

  const itens = dados?.itens ?? [];
  const concluidos = fila.filter((i) => i.estado === 'pronto' || i.estado === 'processando').length;
  const abreEm = dados?.abreEm ? new Date(dados.abreEm).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="fotos-pagina">
      <header className="fotos-pagina__topo">
        <button className="fotos-pagina__marca" onClick={() => navegar('/')} aria-label="Voltar ao site">
          N<em>&amp;</em>V
        </button>
        <a
          className="fotos-pagina__voltar"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navegar('/');
          }}
        >
          Voltar ao site
        </a>
      </header>

      <main className="fotos-pagina__conteudo">
        <div className="nv-section-header fotos-pagina__cabecalho">
          <p className="nv-script-eyebrow">Pelos seus olhos</p>
          <h1 className="nv-title">Fotos dos convidados</h1>
          <p className="fotos-pagina__lead">
            Fotografou ou filmou um momento da festa? Envie aqui! Tudo aparece nesta página para todo mundo ver e fica guardado para sempre com a gente.
          </p>
        </div>

        {dados && !dados.aberto && (
          <div className="fotos-envio fotos-envio--fechado" role="status">
            <Icon name="calendar" size={22} />
            <p>{abreEm ? `O envio de fotos abre no dia do casamento, ${abreEm}.` : 'O envio de fotos está fechado no momento.'}</p>
          </div>
        )}

        {dados?.aberto && (
          <section className="fotos-envio" aria-label="Enviar fotos e vídeos">
            <label className="fotos-envio__campo">
              <span className="nv-label">Seu nome (opcional)</span>
              <input
                className="nv-input"
                value={nome}
                maxLength={60}
                autoComplete="name"
                placeholder="Para saberem quem enviou"
                onChange={(e) => setNome(e.target.value)}
                onBlur={() => salvarNome(nome)}
              />
            </label>
            <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => escolher(e.target.files)} />
            <button
              type="button"
              className="nv-btn fotos-envio__botao"
              onClick={() => {
                salvarNome(nome);
                input.current?.click();
              }}
            >
              <Icon name="upload" size={18} /> Escolher fotos e vídeos
            </button>
            <p className="fotos-envio__dica">Pode escolher várias de uma vez. Vídeos de até 1 minuto. Deixe esta página aberta até terminar.</p>

            {fila.length > 0 && (
              <ul className="fotos-fila" aria-live="polite">
                {fila.map((i) => (
                  <li key={i.id} className={`fotos-fila__item is-${i.estado}`}>
                    <span className="fotos-fila__previa">
                      {i.previa ? <img src={i.previa} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <Icon name={i.tipo === 'video' ? 'play' : 'camera'} size={18} />}
                    </span>
                    <span className="fotos-fila__info">
                      <span className="fotos-fila__nome">{i.arquivo.name || (i.tipo === 'video' ? 'Vídeo' : 'Foto')}</span>
                      {i.estado === 'enviando' && (
                        <span className="fotos-fila__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(i.progresso * 100)}>
                          <span style={{ width: `${Math.round(i.progresso * 100)}%` }} />
                        </span>
                      )}
                      <span className="fotos-fila__estado">
                        {i.estado === 'fila' && 'Na fila'}
                        {i.estado === 'enviando' && (i.progresso >= 1 ? 'Finalizando…' : `Enviando… ${Math.round(i.progresso * 100)}%`)}
                        {i.estado === 'pronto' && 'Enviada!'}
                        {i.estado === 'processando' && 'Enviado! O vídeo aparece aqui em instantes.'}
                        {i.estado === 'erro' && i.erro}
                      </span>
                    </span>
                    {(i.estado === 'pronto' || i.estado === 'processando') && <Icon name="check" size={18} className="fotos-fila__ok" />}
                    {i.estado === 'erro' && tipoDoArquivo(i.arquivo) && (
                      <button className="fotos-fila__repetir" onClick={() => tentarDeNovo(i.id)}>
                        Tentar de novo
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {concluidos > 0 && !pendentes && (
              <p className="fotos-envio__obrigado">
                Obrigado por compartilhar! 💛{' '}
                <button className="fotos-envio__limpar" onClick={limparConcluidos}>
                  Limpar lista
                </button>
              </p>
            )}
          </section>
        )}

        {erroLista && !dados && (
          <p className="fotos-pagina__erro" role="alert">
            {erroLista}
          </p>
        )}
        {!dados && !erroLista && <p className="fotos-pagina__carregando">Carregando…</p>}

        {dados && itens.length === 0 && (
          <EstadoVazio icon="camera" titulo="Nenhuma foto ainda">
            {dados.aberto ? 'Seja o primeiro a compartilhar um momento!' : 'As fotos dos convidados vão aparecer aqui.'}
          </EstadoVazio>
        )}

        {itens.length > 0 && (
          <ul className="fotos-grade">
            {itens.map((m: MidiaConvidado, i) => (
              <li key={m.uid}>
                <button className="fotos-grade__item" onClick={() => setAberta(i)} aria-label={`${m.tipo === 'video' ? 'Vídeo' : 'Foto'}${m.nome ? ` de ${m.nome}` : ''}`}>
                  <img src={m.miniatura} alt="" loading="lazy" draggable={false} />
                  {m.tipo === 'video' && (
                    <span className="fotos-grade__video" aria-hidden>
                      <Icon name="play" size={14} /> {formatarDuracao(m.duracao)}
                    </span>
                  )}
                  {meus.has(m.uid) && <span className="fotos-grade__minha">Sua</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {dados?.proxima && (
          <div className="fotos-pagina__mais">
            <button className="nv-btn-outline" onClick={carregarMais} disabled={carregandoMais}>
              {carregandoMais ? 'Carregando…' : 'Ver mais'}
            </button>
          </div>
        )}
      </main>

      {aberta !== null && (
        <VisorMidia
          itens={itens}
          indice={aberta}
          onMudar={setAberta}
          onFechar={() => setAberta(null)}
          podeExcluir={(uid) => meus.has(uid)}
          onExcluir={excluir}
        />
      )}
    </div>
  );
}
