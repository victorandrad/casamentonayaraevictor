import { useEffect, useState } from 'react';
import { Icon, Ornament } from '@nv/shared';
import { errorMessage, formatBRL } from '@nv/shared/api';
import type { PedidoPublico } from '@nv/shared/types';
import { consultarPedido } from './pagamento';

// `uid`: the order's public UUID from the return URL.
type Props = { uid: string; onConcluido: () => void; onFechar: () => void };

const TENTATIVAS = 6;

// Shown when Mercado Pago sends the guest back. Polls briefly because the payment
// confirmation (webhook) can land a few seconds after the redirect.
export function RetornoPagamento({ uid, onConcluido, onFechar }: Props) {
  const [pedido, setPedido] = useState<PedidoPublico | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    const buscar = async (tentativa: number) => {
      try {
        const p = await consultarPedido(uid);
        if (!ativo) return;
        setPedido(p);
        if (p.status === 'pago' || p.status === 'aguardando') onConcluido();
        if (p.status === 'pendente' && tentativa < TENTATIVAS) timer = setTimeout(() => buscar(tentativa + 1), 2000);
      } catch (error) {
        if (ativo) setErro(errorMessage(error));
      }
    };
    buscar(1);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [uid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar]);

  const irParaRecados = () => {
    onFechar();
    document.getElementById('recados')?.scrollIntoView({ behavior: 'smooth' });
  };

  const status = pedido?.status;
  const titulo =
    status === 'pago'
      ? 'Muito obrigado!'
      : status === 'aguardando'
        ? 'Quase lá!'
        : status === 'falhou' || status === 'expirado' || status === 'estornado'
          ? 'Pagamento não concluído'
          : 'Confirmando pagamento…';

  return (
    <div className="checkout-overlay retorno-overlay" onClick={onFechar}>
      <div className="retorno nv-fade-up" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <button className="checkout__close retorno__close" onClick={onFechar} aria-label="Fechar">
          ×
        </button>

        {erro ? (
          <>
            <h2 className="checkout__title">Não conseguimos confirmar</h2>
            <p className="checkout__hint">{erro} Se o valor foi cobrado, fique tranquilo: os noivos recebem do mesmo jeito.</p>
          </>
        ) : (
          <>
            <div className={`retorno__icon retorno__icon--${status ?? 'pendente'}`}>
              <Icon name={status === 'falhou' || status === 'expirado' || status === 'estornado' ? 'clock' : 'heart'} size={38} />
            </div>
            <h2 className="retorno__title">{titulo}</h2>
            <Ornament className="nv-ornament" />

            {status === 'pago' && (
              <p className="retorno__text">
                {pedido!.nome.split(' ')[0]}, seu presente chegou! Ele vai fazer parte do começo da nossa nova vida.
              </p>
            )}
            {status === 'aguardando' && (
              <p className="retorno__text">
                Recebemos seu pedido. Assim que o pagamento for confirmado pelo banco, o presente chega para nós.
              </p>
            )}
            {(status === 'falhou' || status === 'expirado' || status === 'estornado') && (
              <p className="retorno__text">
                O pagamento não foi concluído e nada foi cobrado. Seus presentes continuam no carrinho para tentar de novo.
              </p>
            )}
            {(!status || status === 'pendente') && (
              <p className="retorno__text">Estamos aguardando a confirmação do pagamento. Isso leva só alguns segundos.</p>
            )}

            {pedido && pedido.itens.length > 0 && (
              <ul className="checkout__summary">
                {pedido.itens.map((i, n) => (
                  <li key={n}>
                    <span>
                      {i.quantidade > 1 && `${i.quantidade}× `}
                      {i.nome}
                    </span>
                    <span>{formatBRL(i.valorCentavos * i.quantidade)}</span>
                  </li>
                ))}
                <li className="checkout__summary-total">
                  <span>Total</span>
                  <span>{formatBRL(pedido.totalCentavos)}</span>
                </li>
              </ul>
            )}
          </>
        )}

        {status === 'pago' || status === 'aguardando' ? (
          <>
            <button className="nv-btn nv-btn--block" onClick={irParaRecados}>
              Deixar um recado no mural
            </button>
            <button className="checkout__link" onClick={onFechar}>
              Voltar ao site
            </button>
          </>
        ) : (
          <button className="nv-btn-outline retorno__ok" onClick={onFechar}>
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}
