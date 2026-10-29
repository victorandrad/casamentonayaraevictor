import { useEffect, useRef, useState } from 'react';
import type { PedidoInput } from '@nv/shared/types';
import { carregarMercadoPago, dadosDoBrick, type ControladorBrick } from './pagamento';

const CONTAINER = 'presentes-pagamento-brick';
// Mercado Pago's SDK sometimes fails to start the Brick without calling onError (only a console
// message): if it isn't ready by then, say so instead of "loading" forever.
const LIMITE_CARREGAMENTO = 20_000;
const ERRO_CARREGAMENTO = 'Não foi possível carregar o pagamento seguro. Verifique sua conexão e tente de novo.';

// One Brick at a time in the container: a new one (props changed, "tentar de novo", React's double
// effects in development) waits until the previous one finished loading and was taken down, so a
// late unmount can't remove the new form.
let fila: Promise<void> = Promise.resolve();

type Props = {
  publicKey: string;
  totalCentavos: number;
  email: string;
  cpf: string;
  // Called with the guest's choice; resolve when the API answered (the Brick then stops its
  // spinner), throw to let the guest try again.
  onPagar: (pagamento: PedidoInput['pagamento']) => Promise<void>;
};

// Mercado Pago's Payment Brick: card (up to 12x), debit card and Pix, drawn by Mercado Pago in its
// own iframe. The site only gets back a one-time card token or the Pix choice.
export function PagamentoBrick({ publicKey, totalCentavos, email, cpf, onPagar }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  // The Brick keeps the callbacks it was created with: read the latest ones through a ref.
  const pagarRef = useRef(onPagar);
  pagarRef.current = onPagar;

  useEffect(() => {
    let ativo = true;
    let controlador: ControladorBrick | null = null;
    setCarregando(true);
    setPronto(false);
    setErro('');
    const limite = setTimeout(() => {
      if (ativo) {
        setErro((atual) => atual || ERRO_CARREGAMENTO);
        setCarregando(false);
      }
    }, LIMITE_CARREGAMENTO);

    const montar = async () => {
      if (!ativo) return;
      try {
        const MercadoPago = await carregarMercadoPago();
        if (!ativo) return;
        const mp = new MercadoPago(publicKey, { locale: 'pt-BR' });
        const criado = await mp.bricks().create('payment', CONTAINER, {
          initialization: {
            amount: totalCentavos / 100,
            payer: { email, identification: { type: 'CPF', number: cpf } },
          },
          customization: {
            paymentMethods: { creditCard: 'all', debitCard: 'all', bankTransfer: 'all', maxInstallments: 12 },
            visual: {
              style: {
                theme: 'default',
                customVariables: { baseColor: '#c58a83', borderRadiusLarge: '18px', borderRadiusMedium: '12px', formBackgroundColor: '#fbf8f3' },
              },
            },
          },
          callbacks: {
            onReady: () => {
              if (!ativo) return;
              clearTimeout(limite);
              setErro('');
              setPronto(true);
              setCarregando(false);
            },
            onError: () => ativo && setErro('O formulário de pagamento encontrou um problema. Confira os dados ou recarregue a página.'),
            onSubmit: ({ formData }: { formData: Parameters<typeof dadosDoBrick>[0] }) => pagarRef.current(dadosDoBrick(formData)),
          },
        });
        // Closed before the Brick finished loading: take it down right away.
        if (ativo) controlador = criado;
        else criado.unmount();
      } catch (error) {
        if (ativo) {
          setErro((error as Error).message);
          setCarregando(false);
        }
      }
    };
    // Never let a load that hangs forever block the next attempt.
    fila = fila.then(() => Promise.race([montar(), new Promise<void>((resolve) => setTimeout(resolve, LIMITE_CARREGAMENTO))]));

    return () => {
      ativo = false;
      clearTimeout(limite);
      controlador?.unmount();
    };
  }, [publicKey, totalCentavos, email, cpf, tentativa]);

  return (
    <div className="checkout__brick">
      {carregando && !erro && <p className="checkout__hint">Carregando o pagamento seguro…</p>}
      {erro && (
        <div className="checkout__alert" role="alert">
          {erro}{' '}
          {!pronto && (
            <button type="button" className="checkout__link checkout__link--inline" onClick={() => setTentativa((n) => n + 1)}>
              Tentar de novo
            </button>
          )}
        </div>
      )}
      <div id={CONTAINER} />
    </div>
  );
}
