import { useMemo, useState } from 'react';
import { EstadoVazio } from '@nv/shared';
import { errorMessage, formatBRL } from '@nv/shared/api';
import type { PedidoAdmin, StatusPedido } from '@nv/shared/types';
import { adminApi, formatDate } from '../adminApi';
import { useLoad } from '../useLoad';
import { Paginacao, usePaginacao } from '../Paginacao';

const carregar = () => adminApi<PedidoAdmin[]>('/admin/pedidos');

const statusLabel: Record<StatusPedido, string> = {
  pago: 'Pago',
  aguardando: 'Aguardando banco',
  pendente: 'No checkout',
  falhou: 'Falhou',
  expirado: 'Não concluído',
};
const badge: Record<StatusPedido, string> = {
  pago: 'sim',
  aguardando: 'pendente',
  pendente: 'pendente',
  falhou: 'nao',
  expirado: 'nao',
};

const nomesForma: Record<string, string> = { card: 'Cartão', pix: 'Pix', boleto: 'Boleto', link: 'Link' };
const nomeForma = (forma: string | null) => (forma ? (nomesForma[forma] ?? forma) : 'Outra');
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function descricaoForma(p: PedidoAdmin) {
  const nome = nomeForma(p.formaPagamento);
  return p.bandeira ? `${nome} · ${capitalizar(p.bandeira)}` : nome;
}

const percentual = (parte: number, total: number) =>
  total ? `${((parte / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '–';

type Filtro = 'pagos' | 'todos';
type LinhaForma = { forma: string; pagamentos: number; bruto: number; taxa: number; liquido: number; semTaxa: number };

export function Recebidos() {
  const { data: pedidos, setData, erro, setErro, reload } = useLoad(carregar);
  const [reenviando, setReenviando] = useState<string | null>(null);

  const reenviarRecibo = async (p: PedidoAdmin) => {
    setReenviando(p.id);
    try {
      await adminApi(`/admin/pedidos/${p.id}/recibo`, { method: 'POST' });
      const agora = new Date().toISOString();
      setData((lista) => (lista ?? []).map((x) => (x.id === p.id ? { ...x, reciboEnviadoEm: agora } : x)));
      setErro('');
    } catch (error) {
      setErro(errorMessage(error));
    } finally {
      setReenviando(null);
    }
  };
  const [filtro, setFiltro] = useState<Filtro>('pagos');

  const pagos = useMemo(() => (pedidos ?? []).filter((p) => p.status === 'pago'), [pedidos]);
  const visiveis = filtro === 'pagos' ? pagos : (pedidos ?? []);
  const paginacao = usePaginacao(visiveis, { reiniciarQuando: [filtro] });

  const totais = useMemo(() => {
    const bruto = pagos.reduce((s, p) => s + p.totalCentavos, 0);
    const taxa = pagos.reduce((s, p) => s + (p.taxaCentavos ?? 0), 0);
    const liquido = pagos.reduce((s, p) => s + (p.liquidoCentavos ?? p.totalCentavos), 0);
    const pendentes = pagos.filter((p) => p.taxaCentavos === null).length;
    return { bruto, taxa, liquido, pendentes };
  }, [pagos]);

  // One row per payment method (card, Pix...), each with its own effective rate.
  const porForma = useMemo(() => {
    const linhas = new Map<string, LinhaForma>();
    for (const p of pagos) {
      const forma = nomeForma(p.formaPagamento);
      const l = linhas.get(forma) ?? { forma, pagamentos: 0, bruto: 0, taxa: 0, liquido: 0, semTaxa: 0 };
      l.pagamentos += 1;
      l.bruto += p.totalCentavos;
      if (p.taxaCentavos === null) l.semTaxa += 1;
      else {
        l.taxa += p.taxaCentavos;
        l.liquido += p.liquidoCentavos ?? p.totalCentavos - p.taxaCentavos;
      }
      linhas.set(forma, l);
    }
    return [...linhas.values()].sort((a, b) => b.bruto - a.bruto);
  }, [pagos]);

  return (
    <section>
      <div className="painel-section-head">
        <h2 className="painel-h2">Presentes recebidos</h2>
        <button className="nv-btn-ghost" onClick={reload}>
          Atualizar
        </button>
      </div>
      <p className="painel-hint">
        Pagamentos feitos pelo Stripe. As taxas são as cobradas de verdade pelo Stripe em cada pagamento, conforme a forma
        usada (cartão, Pix…). O valor líquido cai na conta Stripe e segue para o banco nos repasses.
      </p>

      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}

      {pedidos && (
        <>
          <div className="painel-stats">
            <div className="painel-stat">
              <span className="painel-stat__value">{formatBRL(totais.bruto)}</span>
              <span className="painel-stat__label">recebido dos convidados</span>
              <span className="painel-stat__hint">{pagos.length} presente(s) pago(s)</span>
            </div>
            <div className="painel-stat">
              <span className="painel-stat__value">{formatBRL(totais.taxa)}</span>
              <span className="painel-stat__label">taxas do Stripe</span>
              <span className="painel-stat__hint">{percentual(totais.taxa, totais.bruto - pendentesBruto(pagos))} em média</span>
            </div>
            <div className="painel-stat painel-stat--destaque">
              <span className="painel-stat__value">{formatBRL(totais.liquido)}</span>
              <span className="painel-stat__label">líquido para vocês</span>
              {totais.pendentes > 0 && (
                <span className="painel-stat__hint">{totais.pendentes} taxa(s) ainda sendo calculada(s) pelo Stripe</span>
              )}
            </div>
          </div>

          {porForma.length > 0 && (
            <div className="painel-card painel-taxas">
              <h3 className="painel-h3">Taxas por forma de pagamento</h3>
              <div className="painel-table-wrap">
                <table className="painel-table">
                  <thead>
                    <tr>
                      <th scope="col">Forma</th>
                      <th scope="col">Pagamentos</th>
                      <th scope="col">Recebido</th>
                      <th scope="col">Taxa</th>
                      <th scope="col">Taxa média</th>
                      <th scope="col">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porForma.map((l) => (
                      <tr key={l.forma}>
                        <th scope="row">{l.forma}</th>
                        <td>{l.pagamentos}</td>
                        <td>{formatBRL(l.bruto)}</td>
                        <td>{formatBRL(l.taxa)}</td>
                        <td>{l.semTaxa === l.pagamentos ? 'calculando…' : percentual(l.taxa, l.bruto - brutoSemTaxa(pagos, l.forma))}</td>
                        <td className="painel-table__strong">{formatBRL(l.liquido + brutoSemTaxa(pagos, l.forma))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {pedidos && pedidos.length > 0 && (
        <div className="painel-chips" role="group" aria-label="Filtrar pedidos">
          {(
            [
              ['pagos', 'Pagos'],
              ['todos', 'Todos'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={filtro === id ? 'painel-chip is-active' : 'painel-chip'} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {!pedidos && !erro && <p className="painel-empty">Carregando…</p>}
      {pedidos?.length === 0 && (
        <EstadoVazio icon="gift" titulo="Nenhum presente recebido ainda">
          Quando um convidado presentear vocês pelo site, o pagamento aparece aqui com valores, taxas e recibo.
        </EstadoVazio>
      )}
      {pedidos && pedidos.length > 0 && visiveis.length === 0 && (
        <EstadoVazio
          icon="gift"
          titulo="Nenhum presente pago ainda"
          acao={
            <button className="nv-btn-ghost" onClick={() => setFiltro('todos')}>
              Ver todos os pedidos
            </button>
          }
        >
          Há {pedidos.length} pedido(s) que ainda não foram pagos ou foram cancelados.
        </EstadoVazio>
      )}

      <ul className="painel-list painel-list--spaced">
        {paginacao.visiveis.map((p) => (
          <li key={p.id} className={p.status === 'pago' || p.status === 'aguardando' ? 'painel-item' : 'painel-item is-muted'}>
            <div className="painel-item__main">
              <div className="painel-item__title">
                <strong>{p.nome}</strong>
                <span className={`painel-badge painel-badge--${badge[p.status]}`}>{statusLabel[p.status]}</span>
                {p.status === 'pago' && <span className="painel-forma">{descricaoForma(p)}</span>}
              </div>
              <div className="painel-item__meta">
                <span>Pedido #{p.numero}</span>
                <span>{p.email}</span>
                <span>{formatDate(p.pagoEm ?? p.criadoEm)}</span>
              </div>
              <ul className="painel-pedido-itens">
                {p.itens.map((i, n) => (
                  <li key={n}>
                    {i.quantidade > 1 && `${i.quantidade}× `}
                    {i.nome} <span>{formatBRL(i.valorCentavos * i.quantidade)}</span>
                  </li>
                ))}
              </ul>
              {p.mensagem && <p className="painel-item__msg">“{p.mensagem}”</p>}
              {p.status === 'pago' && (
                <p className="painel-recibo">
                  {p.reciboEnviadoEm ? (
                    <span className="painel-recibo__ok">✓ Recibo enviado em {formatDate(p.reciboEnviadoEm)}</span>
                  ) : (
                    <span className="painel-recibo__pendente">Recibo ainda não enviado</span>
                  )}
                  <button className="painel-link" onClick={() => reenviarRecibo(p)} disabled={reenviando === p.id}>
                    {reenviando === p.id ? 'Enviando…' : p.reciboEnviadoEm ? 'Reenviar recibo' : 'Enviar recibo'}
                  </button>
                </p>
              )}
            </div>
            <div className="painel-item__actions painel-pedido-valores">
              <span className="painel-pedido-total">{formatBRL(p.totalCentavos)}</span>
              {p.status === 'pago' &&
                (p.taxaCentavos !== null ? (
                  <>
                    <span className="painel-pedido-taxa">
                      − {formatBRL(p.taxaCentavos)} de taxa ({percentual(p.taxaCentavos, p.totalCentavos)})
                    </span>
                    <span className="painel-pedido-liquido">
                      Líquido {formatBRL(p.liquidoCentavos ?? p.totalCentavos - p.taxaCentavos)}
                    </span>
                  </>
                ) : (
                  <span className="painel-pedido-taxa">Taxa sendo calculada pelo Stripe</span>
                ))}
            </div>
          </li>
        ))}
      </ul>
      <Paginacao {...paginacao} rotulo="pedidos" />
    </section>
  );
}

// Gross of paid orders whose fee isn't known yet: excluded from average rates.
function pendentesBruto(pagos: PedidoAdmin[]) {
  return pagos.filter((p) => p.taxaCentavos === null).reduce((s, p) => s + p.totalCentavos, 0);
}

function brutoSemTaxa(pagos: PedidoAdmin[], forma: string) {
  return pagos
    .filter((p) => p.taxaCentavos === null && nomeForma(p.formaPagamento) === forma)
    .reduce((s, p) => s + p.totalCentavos, 0);
}
