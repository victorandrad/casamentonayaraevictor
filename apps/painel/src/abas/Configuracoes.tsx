import { useState, type FormEvent } from 'react';
import { NOME_GATEWAY } from '@nv/shared';
import { descreverTaxa, precoComTaxa } from '@nv/shared/taxas';
import { formatBRL } from '@nv/shared/api';
import { errorMessage } from '@nv/shared/api';
import type { Configuracoes as ConfigData, Usuario } from '@nv/shared/types';
import { adminApi } from '../adminApi';
import { useLoad } from '../useLoad';

const carregar = () => adminApi<ConfigData>('/admin/configuracoes');

export function Configuracoes({ usuario }: { usuario: Usuario }) {
  const { data, setData, erro, setErro } = useLoad(carregar);
  const [salvo, setSalvo] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    try {
      setData(await adminApi<ConfigData>('/admin/configuracoes', { method: 'PUT', body: { taxa: data.taxa } }));
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
      <div className="painel-card painel-narrow">
        <h3 className="painel-h3">Formas de pagamento</h3>
        {data && (
          <p className="painel-hint">
            Os convidados pagam com <strong>Pix</strong> ou <strong>cartão</strong> no ambiente seguro do{' '}
            <strong>{NOME_GATEWAY[data.gateway]}</strong>, e o valor cai na conta de vocês lá.{' '}
            {data.gateway === 'mercadopago'
              ? 'Pix, cartão e saldo do Mercado Pago já vêm ativos no Checkout Pro; nada a cadastrar aqui.'
              : 'As formas de pagamento são ativadas no painel do Stripe, em Configurações → Formas de pagamento.'}{' '}
            A plataforma usada é definida no servidor (variável <code>PAGAMENTO_GATEWAY</code>).
          </p>
        )}
      </div>

      <form className="painel-card painel-narrow" onSubmit={salvar}>
        <h3 className="painel-h3">Taxa dos presentes</h3>
        <p className="painel-hint">
          Taxa do pagamento embutida no preço de cada presente. O cálculo é feito de trás para frente, para que, depois do
          desconto da plataforma de pagamento, sobre exatamente o valor cadastrado. O padrão (5,99% + R$ 0,39) é a taxa de
          cartão internacional do Stripe, o caso mais caro; no Mercado Pago, cartão com recebimento na hora custa 4,98%
          (Pix, 0,99%), então o padrão cobre qualquer forma de pagamento.
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
