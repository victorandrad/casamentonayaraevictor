import { useState } from 'react';
import { EstadoVazio } from '@nv/shared';
import { errorMessage } from '@nv/shared/api';
import type { RecadoAdmin } from '@nv/shared/types';
import { adminApi, formatDate } from '../adminApi';
import { useLoad } from '../useLoad';
import { Paginacao, usePaginacao } from '../Paginacao';
import { ConfirmarModal } from '../Modal';

const carregar = () => adminApi<RecadoAdmin[]>('/admin/recados');

export function Recados() {
  const { data: recados, setData, erro, setErro } = useLoad(carregar);
  const paginacao = usePaginacao(recados ?? []);
  const [excluindo, setExcluindo] = useState<RecadoAdmin | null>(null);

  const alternar = async (r: RecadoAdmin) => {
    try {
      const atualizado = await adminApi<RecadoAdmin>(`/admin/recados/${r.id}`, { method: 'PATCH', body: { visivel: !r.visivel } });
      setData((list) => (list ?? []).map((x) => (x.id === r.id ? atualizado : x)));
    } catch (error) {
      setErro(errorMessage(error));
    }
  };

  const excluir = async (r: RecadoAdmin) => {
    await adminApi(`/admin/recados/${r.id}`, { method: 'DELETE' });
    setData((list) => (list ?? []).filter((x) => x.id !== r.id));
  };

  return (
    <section>
      <h2 className="painel-h2">Recados do mural</h2>
      <p className="painel-hint">Recados ocultos não aparecem no site, mas continuam guardados aqui.</p>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      {!recados && !erro && <p className="painel-empty">Carregando…</p>}
      {recados?.length === 0 && (
        <EstadoVazio icon="envelope" titulo="Nenhum recado ainda">
          Quando os convidados deixarem recados no mural do site, eles aparecem aqui para vocês moderarem.
        </EstadoVazio>
      )}
      <ul className="painel-list">
        {paginacao.visiveis.map((r) => (
          <li key={r.id} className={r.visivel ? 'painel-item' : 'painel-item is-muted'}>
            <div className="painel-item__main">
              <div className="painel-item__title">
                <strong>{r.nome}</strong>
                {!r.visivel && <span className="painel-badge painel-badge--nao">Oculto</span>}
              </div>
              <p className="painel-item__msg">“{r.mensagem}”</p>
              <div className="painel-item__meta">
                <span>{formatDate(r.criadoEm)}</span>
              </div>
            </div>
            <div className="painel-item__actions">
              <button className="painel-link" onClick={() => alternar(r)}>
                {r.visivel ? 'Ocultar' : 'Mostrar no site'}
              </button>
              <button className="painel-link painel-link--danger" onClick={() => setExcluindo(r)}>
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Paginacao {...paginacao} rotulo="recados" />
      {excluindo && (
        <ConfirmarModal
          titulo="Excluir recado"
          mensagem={
            <>
              Excluir o recado de <strong>{excluindo.nome}</strong>? Isso não pode ser desfeito.
              {excluindo.visivel && ' Para só tirar do site, use “Ocultar”.'}
            </>
          }
          confirmar="Excluir recado"
          onConfirmar={() => excluir(excluindo)}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </section>
  );
}
