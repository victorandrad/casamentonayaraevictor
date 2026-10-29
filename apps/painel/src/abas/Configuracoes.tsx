import { useState, type FormEvent } from 'react';
import { descreverTaxa, precoComTaxa } from '@nv/shared/taxas';
import { formatBRL } from '@nv/shared/api';
import { errorMessage } from '@nv/shared/api';
import type { Configuracoes as ConfigData, Usuario } from '@nv/shared/types';
import { adminApi } from '../adminApi';
import { useLoad } from '../useLoad';
import { ContaMercadoPago } from '../ContaMercadoPago';

const carregar = () => adminApi<ConfigData>('/admin/configuracoes');

export function Configuracoes({ usuario }: { usuario: Usuario }) {
  const { data, setData, erro, setErro } = useLoad(carregar);
  const [salvo, setSalvo] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    try {
      setData(await adminApi<ConfigData>('/admin/configuracoes', { method: 'PUT', body: data }));
      setErro('');
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (error) {
      setErro(errorMessage(error));
    }
  };

  return (
    <section>
      <h2 className="painel-h2">Configurações</h2>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      <ContaMercadoPago />

      <form className="painel-card painel-narrow" onSubmit={salvar}>
        <h3 className="painel-h3">Taxa dos presentes</h3>
        <p className="painel-hint">
          Taxa do pagamento embutida no preço de cada presente. O cálculo é feito de trás para frente, para que, depois do
          desconto do Mercado Pago, sobre exatamente o valor cadastrado. No Mercado Pago, cartão com recebimento na hora
          custa 4,98% e Pix 0,99%; o padrão (5,99% + R$ 0,39) cobre qualquer forma de pagamento. Juros do parcelamento
          ficam por conta do convidado, a não ser que vocês ofereçam parcelas sem juros na conta do Mercado Pago.
        </p>
        <div className="painel-form-row">
          <div className="painel-field painel-field--sm">
            <label className="nv-label" htmlFor="taxa-pct">
              Percentual (%)
            </label>
            <input
              id="taxa-pct"
              className="nv-input"
              type="number"
              min={0}
              max={20}
              step={0.01}
              value={data?.taxa.percentual ?? ''}
              disabled={!data}
              onChange={(e) => setData({ ...data!, taxa: { ...data!.taxa, percentual: Number(e.target.value) } })}
            />
          </div>
          <div className="painel-field painel-field--sm">
            <label className="nv-label" htmlFor="taxa-fixo">
              + Valor fixo (R$)
            </label>
            <input
              id="taxa-fixo"
              className="nv-input"
              type="number"
              min={0}
              max={10}
              step={0.01}
              value={data ? data.taxa.fixoCentavos / 100 : ''}
              disabled={!data}
              onChange={(e) =>
                setData({ ...data!, taxa: { ...data!.taxa, fixoCentavos: Math.round(Number(e.target.value) * 100) } })
              }
            />
          </div>
          <button type="submit" className="nv-btn" disabled={!data}>
            {salvo ? '✓ Salvo' : 'Salvar'}
          </button>
        </div>
        {data && (
          <p className="painel-taxa-preview">
            Exemplo: um presente de R$ 200 aparece para o convidado por{' '}
            <strong>{formatBRL(precoComTaxa(20000, data.taxa))}</strong> ({descreverTaxa(data.taxa)} por produto).
          </p>
        )}
      </form>

      <div className="painel-card painel-narrow">
        <h3 className="painel-h3">Sua conta</h3>
        <p className="painel-hint">
          Conectado como <strong>{usuario.email}</strong>. Nome, senha
          {usuario.dono ? ' e os usuários do painel ficam' : ' ficam'} na aba “Minha conta”.
        </p>
      </div>
    </section>
  );
}
