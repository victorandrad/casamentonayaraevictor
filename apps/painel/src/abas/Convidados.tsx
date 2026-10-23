import { useMemo, useState, type FormEvent } from 'react';
import { EstadoVazio } from '@nv/shared';
import { errorMessage } from '@nv/shared/api';
import type { ConvidadoAdmin, ConvidadoInput } from '@nv/shared/types';
import { adminApi, copyText, formatDate, inviteLink, whatsappLink } from '../adminApi';
import { useLoad } from '../useLoad';
import { Paginacao, usePaginacao } from '../Paginacao';
import { imprimirFolhaQr, QrConviteModal } from '../QrConvite';
import { ConfirmarModal, Modal } from '../Modal';

const carregar = () => adminApi<ConvidadoAdmin[]>('/admin/convidados');
const LIMITES = [0, 1, 2, 3, 4, 5, 6];

type Filtro = 'todos' | 'sim' | 'nao' | 'pendente';
const filtros: Array<[Filtro, string]> = [
  ['todos', 'Todos'],
  ['sim', 'Confirmados'],
  ['pendente', 'Pendentes'],
  ['nao', 'Não vão'],
];

const statusDe = (c: ConvidadoAdmin): Exclude<Filtro, 'todos'> => c.resposta?.status ?? 'pendente';
const statusLabel = { sim: 'Confirmado', nao: 'Não vai', pendente: 'Pendente' };
const byNome = (a: ConvidadoAdmin, b: ConvidadoAdmin) => a.nome.localeCompare(b.nome, 'pt-BR');

function exportarCsv(convidados: ConvidadoAdmin[]) {
  const linhas = [
    ['Nome', 'Código', 'Link', 'Limite de acompanhantes', 'Resposta', 'Acompanhantes', 'Total de pessoas', 'Recado', 'Respondido em'],
    ...convidados.map((c) => [
      c.nome,
      c.codigo,
      inviteLink(c.codigo),
      String(c.limiteAcompanhantes),
      statusLabel[statusDe(c)],
      String(c.resposta?.acompanhantes ?? ''),
      c.resposta?.status === 'sim' ? String(1 + c.resposta.acompanhantes) : '',
      c.resposta?.mensagem ?? '',
      c.resposta ? formatDate(c.resposta.respondidoEm) : '',
    ]),
  ];
  const csv = linhas.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'convidados-nayara-victor.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

function LimiteSelect({ value, onChange, id }: { value: number; onChange: (n: number) => void; id?: string }) {
  return (
    <select id={id} className="nv-input painel-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {LIMITES.map((n) => (
        <option key={n} value={n}>
          {n === 0 ? 'Sem acompanhantes' : `Até ${n} acompanhante${n > 1 ? 's' : ''}`}
        </option>
      ))}
    </select>
  );
}

// Create / edit a guest invitation in a modal.
function ConvidadoModal({
  convidado,
  onSalvo,
  onFechar,
}: {
  convidado: ConvidadoAdmin | null; // null = new invitation
  onSalvo: (c: ConvidadoAdmin) => void;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<ConvidadoInput>({
    nome: convidado?.nome ?? '',
    limiteAcompanhantes: convidado?.limiteAcompanhantes ?? 0,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!dados.nome.trim()) return setErro('Informe o nome que vai no convite.');
    setSalvando(true);
    setErro('');
    try {
      const salvo = await adminApi<ConvidadoAdmin>(convidado ? `/admin/convidados/${convidado.id}` : '/admin/convidados', {
        method: convidado ? 'PUT' : 'POST',
        body: { ...dados, nome: dados.nome.trim() },
      });
      onSalvo(salvo);
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={convidado ? 'Editar convite' : 'Novo convite'}
      subtitulo={convidado ? `Código ${convidado.codigo}` : 'O código do convite é gerado automaticamente.'}
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={
        <>
          <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="nv-btn" disabled={salvando}>
            {salvando ? 'Salvando…' : convidado ? 'Salvar alterações' : 'Criar convite'}
          </button>
        </>
      }
    >
      <label className="nv-label" htmlFor="convite-nome">
        Nome no convite
      </label>
      <input
        id="convite-nome"
        className="nv-input"
        placeholder="Ex.: Família Oliveira"
        value={dados.nome}
        maxLength={120}
        onChange={(e) => setDados({ ...dados, nome: e.target.value })}
      />
      <label className="nv-label" htmlFor="convite-limite">
        Acompanhantes permitidos
      </label>
      <LimiteSelect id="convite-limite" value={dados.limiteAcompanhantes} onChange={(n) => setDados({ ...dados, limiteAcompanhantes: n })} />
      {convidado?.resposta && dados.limiteAcompanhantes < convidado.resposta.acompanhantes && (
        <p className="painel-hint">
          Este convidado confirmou {convidado.resposta.acompanhantes} acompanhante(s); ao salvar, a resposta será ajustada para o novo limite.
        </p>
      )}
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

export function Convidados() {
  const { data: convidados, setData, erro } = useLoad(carregar);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  // Which modal is open: create, edit a guest, or confirm deleting one
  const [formulario, setFormulario] = useState<{ convidado: ConvidadoAdmin | null } | null>(null);
  const [excluindo, setExcluindo] = useState<ConvidadoAdmin | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);
  const [qrDe, setQrDe] = useState<ConvidadoAdmin | null>(null);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (convidados ?? []).filter(
      (c) =>
        (filtro === 'todos' || statusDe(c) === filtro) &&
        (!termo || c.nome.toLowerCase().includes(termo) || c.codigo.toLowerCase().includes(termo)),
    );
  }, [convidados, busca, filtro]);

  const paginacao = usePaginacao(visiveis, { reiniciarQuando: [busca, filtro] });

  const aoSalvar = (salvo: ConvidadoAdmin) =>
    setData((list) => {
      const atual = list ?? [];
      const existe = atual.some((c) => c.id === salvo.id);
      return (existe ? atual.map((c) => (c.id === salvo.id ? salvo : c)) : [...atual, salvo]).sort(byNome);
    });

  const excluir = async (c: ConvidadoAdmin) => {
    await adminApi(`/admin/convidados/${c.id}`, { method: 'DELETE' });
    setData((list) => (list ?? []).filter((x) => x.id !== c.id));
  };

  const copiar = async (c: ConvidadoAdmin) => {
    if (await copyText(inviteLink(c.codigo))) {
      setCopiado(c.id);
      setTimeout(() => setCopiado((id) => (id === c.id ? null : id)), 2000);
    } else {
      window.prompt('Copie o link do convite:', inviteLink(c.codigo));
    }
  };

  return (
    <section>
      <div className="painel-section-head">
        <h2 className="painel-h2">Convidados</h2>
        <div className="painel-head-acoes">
          {convidados && convidados.length > 0 && (
            <>
              <button className="nv-btn-ghost" onClick={() => imprimirFolhaQr(visiveis)}>
                Imprimir QR Codes
              </button>
              <button className="nv-btn-ghost" onClick={() => exportarCsv(visiveis)}>
                Exportar planilha
              </button>
            </>
          )}
          <button className="nv-btn" onClick={() => setFormulario({ convidado: null })}>
            + Novo convite
          </button>
        </div>
      </div>

      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}

      <div className="painel-toolbar">
        <input
          className="nv-input painel-search"
          type="search"
          placeholder="Buscar por nome ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="painel-chips" role="group" aria-label="Filtrar por resposta">
          {filtros.map(([id, label]) => (
            <button
              key={id}
              className={filtro === id ? 'painel-chip is-active' : 'painel-chip'}
              aria-pressed={filtro === id}
              onClick={() => setFiltro(id)}
            >
              {label}
              {convidados && ` · ${id === 'todos' ? convidados.length : convidados.filter((c) => statusDe(c) === id).length}`}
            </button>
          ))}
        </div>
      </div>

      {!convidados && !erro && <p className="painel-empty">Carregando…</p>}
      {convidados?.length === 0 && (
        <EstadoVazio
          icon="envelope"
          titulo="Nenhum convite criado ainda"
          acao={
            <button className="nv-btn" onClick={() => setFormulario({ convidado: null })}>
              Criar o primeiro convite
            </button>
          }
        >
          Cada convite gera um código e um QR Code para o convidado confirmar presença no site.
        </EstadoVazio>
      )}
      {convidados && convidados.length > 0 && visiveis.length === 0 && (
        <EstadoVazio
          icon="search"
          titulo="Nenhum convite encontrado"
          acao={
            <button
              className="nv-btn-ghost"
              onClick={() => {
                setBusca('');
                setFiltro('todos');
              }}
            >
              Limpar busca e filtros
            </button>
          }
        >
          {busca.trim() ? `Nada corresponde a “${busca.trim()}”` : 'Nenhum convite com essa resposta'}
          {busca.trim() && filtro !== 'todos' ? ' com esse filtro.' : '.'}
        </EstadoVazio>
      )}

      <ul className="painel-list">
        {paginacao.visiveis.map((c) => {
          const status = statusDe(c);
          return (
            <li key={c.id} className="painel-item">
              <div className="painel-item__main">
                <div className="painel-item__title">
                  <strong>{c.nome}</strong>
                  <span className={`painel-badge painel-badge--${status}`}>{statusLabel[status]}</span>
                </div>
                <div className="painel-item__meta">
                  <code>{c.codigo}</code>
                  <span>{c.limiteAcompanhantes === 0 ? 'sem acompanhantes' : `até ${c.limiteAcompanhantes} acompanhante(s)`}</span>
                  {c.resposta?.status === 'sim' && (
                    <span className="painel-item__people">
                      {1 + c.resposta.acompanhantes} pessoa{c.resposta.acompanhantes ? 's' : ''}
                    </span>
                  )}
                  {c.resposta && <span>respondeu em {formatDate(c.resposta.respondidoEm)}</span>}
                </div>
                {c.resposta?.mensagem && <p className="painel-item__msg">“{c.resposta.mensagem}”</p>}
              </div>
              <div className="painel-item__actions">
                <button className="painel-link" onClick={() => setQrDe(c)}>
                  QR Code
                </button>
                <button className="painel-link" onClick={() => copiar(c)}>
                  {copiado === c.id ? '✓ Link copiado' : 'Copiar link'}
                </button>
                <a className="painel-link" href={whatsappLink(c.nome, c.codigo)} target="_blank" rel="noopener">
                  WhatsApp
                </a>
                <button className="painel-link" onClick={() => setFormulario({ convidado: c })}>
                  Editar
                </button>
                <button className="painel-link painel-link--danger" onClick={() => setExcluindo(c)}>
                  Excluir
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <Paginacao {...paginacao} rotulo="convites" />

      {formulario && <ConvidadoModal convidado={formulario.convidado} onSalvo={aoSalvar} onFechar={() => setFormulario(null)} />}
      {excluindo && (
        <ConfirmarModal
          titulo="Excluir convite"
          mensagem={
            <>
              Excluir o convite de <strong>{excluindo.nome}</strong> ({excluindo.codigo})?
              {excluindo.resposta && ' A resposta de presença dele também será apagada.'} Isso não pode ser desfeito.
            </>
          }
          confirmar="Excluir convite"
          onConfirmar={() => excluir(excluindo)}
          onFechar={() => setExcluindo(null)}
        />
      )}
      {qrDe && <QrConviteModal convidado={qrDe} onFechar={() => setQrDe(null)} />}
    </section>
  );
}
