import { useEffect, useRef, useState } from 'react';
import { Icon, Ornament } from '@nv/shared';
import { ApiError, errorMessage, formatBRL } from '@nv/shared/api';
import type { PedidoPublico } from '@nv/shared/types';
import { consultarPedido, esquecerPedidoAberto } from './pagamento';

// `uid`: the order's public UUID.
type Props = { uid: string; onConcluido: () => void; onFechar: () => void };

// A payment Mercado Pago hasn't confirmed yet: ask for about 45 seconds.
const TENTATIVAS = 15;
const INTERVALO_PENDENTE = 3000;
// While a Pix waits, check often at first (most are paid within a couple of minutes), then less.
const INTERVALO_PIX = 5000;
const INTERVALO_PIX_DEPOIS = 15_000;
const CONSULTAS_RAPIDAS = 24;

const horario = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// The order's screen after paying in the site: thank-you for an approved card, the Pix code while
// it waits (followed until it is paid or expires), or what went wrong.
export function RetornoPagamento({ uid, onConcluido, onFechar }: Props) {
  const [pedido, setPedido] = useState<PedidoPublico | null>(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [desistiu, setDesistiu] = useState(false);
  // The cart is cleared once, not on every check.
  const concluido = useRef(false);
  const ultimo = useRef<PedidoPublico | null>(null);

  useEffect(() => {
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    const buscar = async (tentativa: number) => {
      try {
        const p = await consultarPedido(uid);
        if (!ativo) return;
        setPedido(p);
        ultimo.current = p;
        if ((p.status === 'pago' || p.status === 'aguardando') && !concluido.current) {
          concluido.current = true;
          onConcluido();
        }
        // Settled one way or the other: nothing to show again on the next visit.
        if (p.status !== 'aguardando' && p.status !== 'pendente') esquecerPedidoAberto();
        if (p.status === 'pendente') {
          if (tentativa < TENTATIVAS) timer = setTimeout(() => buscar(tentativa + 1), INTERVALO_PENDENTE);
          else setDesistiu(true);
        }
        if (p.status === 'aguardando' && p.pix) {
          timer = setTimeout(() => buscar(tentativa + 1), tentativa < CONSULTAS_RAPIDAS ? INTERVALO_PIX : INTERVALO_PIX_DEPOIS);
        }
      } catch (error) {
        if (!ativo) return;
        // An order that doesn't exist (any more): don't bring it back on the next visit.
        if (error instanceof ApiError && error.status === 404) {
          esquecerPedidoAberto();
          setErro(errorMessage(error));
          return;
        }
        // A network blip (common on a phone during a Pix): keep what is on screen and try again.
        if (ultimo.current) timer = setTimeout(() => buscar(tentativa + 1), INTERVALO_PIX_DEPOIS);
        else setErro(errorMessage(error));
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

  const copiarPix = async () => {
    if (!pedido?.pix) return;
    try {
      await navigator.clipboard.writeText(pedido.pix.codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // clipboard blocked: the code is on screen to copy by hand
    }
  };

  const status = pedido?.status;
  const pix = status === 'aguardando' ? pedido?.pix : null;
  const titulo =
    status === 'pago'
      ? 'Muito obrigado!'
      : pix
        ? 'Pague com Pix'
        : status === 'aguardando'
        ? 'Quase lá!'
        : status === 'falhou' || status === 'expirado' || status === 'estornado'
          ? 'Pagamento não concluído'
          : 'Confirmando pagamento…';

  return (
    // Only the X closes it (like the checkout): a stray click must not hide a Pix being paid.
    <div className="checkout-overlay retorno-overlay">
      <div className={pix ? 'retorno retorno--pix nv-fade-up' : 'retorno nv-fade-up'} role="dialog" aria-modal="true" aria-label={titulo}>
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
            {!pix && (
              <div className={`retorno__icon retorno__icon--${status ?? 'pendente'}`}>
                <Icon name={status === 'falhou' || status === 'expirado' || status === 'estornado' ? 'clock' : 'heart'} size={38} />
              </div>
            )}
            <h2 className="retorno__title">{titulo}</h2>
            {!pix && <Ornament className="nv-ornament" />}

            {status === 'pago' && (
              <p className="retorno__text">
                {pedido!.nome.split(' ')[0]}, seu presente chegou! Ele vai fazer parte do começo da nossa nova vida.
              </p>
            )}
            {pix && (
              <div className="retorno__pix">
                <p className="retorno__text">Abra o app do seu banco, escolha pagar com Pix e escaneie o código ou use o copia e cola.</p>
                {pix.qrBase64 && <img className="retorno__qr" src={`data:image/png;base64,${pix.qrBase64}`} alt="QR Code do Pix" />}
                <div className="retorno__copia">
                  <input className="nv-input" readOnly value={pix.codigo} aria-label="Código Pix copia e cola" onFocus={(e) => e.target.select()} />
                  <button className="nv-btn-outline" onClick={copiarPix}>
                    {copiado ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="retorno__aguardando" role="status">
                  <span className="retorno__ponto" aria-hidden /> Esperando a confirmação do banco. Esta tela atualiza sozinha.
                </p>
                <p className="retorno__nota">
                  {pix.expiraEm ? `Pague até ${horario(pix.expiraEm)}: depois disso o Pix vence, nada é cobrado e o presente volta para a lista.` : 'Se o Pix vencer sem pagamento, nada é cobrado e o presente volta para a lista.'}{' '}
                  Enviamos o QR Code e o código também para o seu e-mail.
                </p>
              </div>
            )}
            {status === 'aguardando' && !pix && (
              <p className="retorno__text">
                Recebemos seu pedido. Assim que o pagamento for confirmado pelo banco, o presente chega para nós.
              </p>
            )}
            {(status === 'falhou' || status === 'expirado' || status === 'estornado') && (
              <p className="retorno__text">
                O pagamento não foi concluído e nada foi cobrado. Se ainda quiser presentear, é só escolher o presente na lista de novo.
              </p>
            )}
            {(!status || status === 'pendente') && (
              <p className="retorno__text">
                {desistiu
                  ? 'O Mercado Pago ainda não confirmou o pagamento. Não pague de novo: se o valor foi cobrado, o presente chega aos noivos e você recebe o recibo por e-mail. Você pode fechar e voltar mais tarde.'
                  : 'Estamos aguardando a confirmação do pagamento. Isso leva só alguns segundos.'}
              </p>
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

        {/* The note on the wall only once the gift is really paid (not while a Pix waits). */}
        {status === 'pago' ? (
          <>
            <button className="nv-btn nv-btn--block" onClick={irParaRecados}>
              Deixar um recado no mural
            </button>
            <button className="checkout__link" onClick={onFechar}>
              Voltar ao site
            </button>
          </>
        ) : status === 'aguardando' ? (
          <button className="checkout__link" onClick={onFechar}>
            Voltar ao site
          </button>
        ) : (
          <button className="nv-btn-outline retorno__ok" onClick={onFechar}>
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}
