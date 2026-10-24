import { EstadoVazio } from '@nv/shared';
import { formatBRL } from '@nv/shared/api';
import type { Resumo as ResumoData } from '@nv/shared/types';
import { adminApi } from '../adminApi';
import { useLoad } from '../useLoad';

const carregar = () => adminApi<ResumoData>('/admin/resumo');

export function Resumo({ onIr }: { onIr: (aba: 'convidados' | 'recados' | 'presentes' | 'recebidos') => void }) {
  const { data, erro } = useLoad(carregar);

  if (erro) return <p className="painel-alert">{erro}</p>;
  if (!data) return <p className="painel-empty">Carregando…</p>;

  const taxa = data.convidados ? Math.round((data.responderam / data.convidados) * 100) : 0;

  return (
    <section>
      <h2 className="painel-h2">Como estão as confirmações</h2>
      {data.convidados === 0 ? (
        <EstadoVazio
          icon="envelope"
          titulo="Nenhum convite criado ainda"
          acao={
            <button className="nv-btn" onClick={() => onIr('convidados')}>
              Criar convites
            </button>
          }
        >
          Crie os convites para acompanhar aqui quem confirmou presença.
        </EstadoVazio>
      ) : (
        <>
          <div className="painel-stats">
            <div className="painel-stat painel-stat--destaque">
              <span className="painel-stat__value">{data.pessoasConfirmadas}</span>
              <span className="painel-stat__label">pessoas confirmadas</span>
              <span className="painel-stat__hint">contando acompanhantes</span>
            </div>
            <div className="painel-stat">
              <span className="painel-stat__value">{data.confirmados}</span>
              <span className="painel-stat__label">convites confirmados</span>
            </div>
            <div className="painel-stat">
              <span className="painel-stat__value">{data.pendentes}</span>
              <span className="painel-stat__label">aguardando resposta</span>
            </div>
            <div className="painel-stat">
              <span className="painel-stat__value">{data.recusaram}</span>
              <span className="painel-stat__label">não poderão ir</span>
            </div>
          </div>

          <div className="painel-progress" aria-label={`${taxa}% dos convites responderam`}>
            <div className="painel-progress__bar" style={{ width: `${taxa}%` }} />
          </div>
          <p className="painel-progress__label">
            {data.responderam} de {data.convidados} convites responderam ({taxa}%)
          </p>
        </>
      )}

      <h2 className="painel-h2">Presentes</h2>
      {data.presentesRecebidos === 0 ? (
        <EstadoVazio
          icon="gift"
          titulo="Nenhum presente recebido ainda"
          acao={
            data.presentes === 0 && (
              <button className="nv-btn" onClick={() => onIr('presentes')}>
                Montar a lista de presentes
              </button>
            )
          }
        >
          {data.presentes === 0
            ? 'Cadastre os presentes para os convidados poderem presentear vocês pelo site.'
            : `Há ${data.presentes} presente(s) na lista. Os pagamentos aparecem aqui assim que chegarem.`}
        </EstadoVazio>
      ) : (
        <div className="painel-stats">
          <div className="painel-stat painel-stat--destaque">
            <span className="painel-stat__value">{formatBRL(data.totalRecebidoCentavos)}</span>
            <span className="painel-stat__label">recebidos em presentes</span>
          </div>
          <div className="painel-stat">
            <span className="painel-stat__value">{formatBRL(data.totalLiquidoCentavos)}</span>
            <span className="painel-stat__label">líquido após taxas</span>
            <span className="painel-stat__hint">{formatBRL(data.totalTaxasCentavos)} em taxas do pagamento</span>
          </div>
          <div className="painel-stat">
            <span className="painel-stat__value">{data.presentesRecebidos}</span>
            <span className="painel-stat__label">presentes pagos</span>
          </div>
        </div>
      )}

      <div className="painel-shortcuts">
        <button className="painel-shortcut" onClick={() => onIr('recebidos')}>
          Ver presentes recebidos →
        </button>
        <button className="painel-shortcut" onClick={() => onIr('convidados')}>
          <strong>{data.convidados}</strong> convites na lista →
        </button>
        <button className="painel-shortcut" onClick={() => onIr('recados')}>
          <strong>{data.recados}</strong> recados no mural
          {data.recadosOcultos > 0 && ` (${data.recadosOcultos} ocultos)`} →
        </button>
        <button className="painel-shortcut" onClick={() => onIr('presentes')}>
          <strong>{data.presentes}</strong> presentes na lista →
        </button>
      </div>
    </section>
  );
}
