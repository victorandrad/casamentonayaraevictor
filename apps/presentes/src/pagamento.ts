import { api } from '@nv/shared/api';
import type { PagamentoResultado, PedidoInput, PedidoPublico } from '@nv/shared/types';
import type { ItemCarrinho } from './carrinho';

export type Convidado = { nome: string; email: string; mensagem: string; cpf: string };

// ---- Mercado Pago's scripts ----

// The SDK draws the payment form (Payment Brick) in Mercado Pago's own iframe, so card data never
// touches the site; security.js sets the device id their anti-fraud uses. Both load only when the
// guest reaches the payment step.
const SDK = 'https://sdk.mercadopago.com/js/v2';
const SEGURANCA = 'https://www.mercadopago.com/v2/security.js';

type FormDataBrick = {
  token?: string;
  issuer_id?: string | number | null;
  payment_method_id?: string;
  installments?: number;
};
export type ControladorBrick = { unmount: () => void };
type MercadoPagoSdk = new (
  publicKey: string,
  opcoes: { locale: string },
) => {
  bricks: () => {
    create: (tipo: 'payment', container: string, settings: unknown) => Promise<ControladorBrick>;
  };
};

declare global {
  interface Window {
    MercadoPago?: MercadoPagoSdk;
    MP_DEVICE_SESSION_ID?: string;
  }
}

const carregados = new Map<string, Promise<void>>();

function carregarScript(src: string, atributos: Record<string, string> = {}): Promise<void> {
  let carregando = carregados.get(src);
  if (!carregando) {
    carregando = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      for (const [nome, valor] of Object.entries(atributos)) script.setAttribute(nome, valor);
      script.onload = () => resolve();
      script.onerror = () => {
        carregados.delete(src);
        script.remove();
        reject(new Error('Não foi possível carregar o pagamento seguro. Verifique sua conexão e tente de novo.'));
      };
      document.head.appendChild(script);
    });
    carregados.set(src, carregando);
  }
  return carregando;
}

export async function carregarMercadoPago(): Promise<MercadoPagoSdk> {
  // The device id is a best-effort extra: a blocked security.js must not stop the payment.
  void carregarScript(SEGURANCA, { view: 'checkout' }).catch(() => {});
  await carregarScript(SDK);
  if (!window.MercadoPago) throw new Error('Não foi possível carregar o pagamento seguro. Tente de novo.');
  return window.MercadoPago;
}

export const dispositivo = () => {
  const id = window.MP_DEVICE_SESSION_ID;
  return id && /^[A-Za-z0-9:_-]{1,200}$/.test(id) ? id : undefined;
};

// ---- API ----

export const configPagamento = () => api<{ disponivel: boolean; publicKey: string | null }>('/public/pagamento');

// What the Payment Brick hands over becomes either a card token or the Pix choice. The amount it
// carries is ignored: the API charges the price from the database.
export function dadosDoBrick(formData: FormDataBrick): PedidoInput['pagamento'] {
  if (formData.payment_method_id === 'pix') return { metodo: 'pix' };
  if (!formData.token || !formData.payment_method_id || !formData.installments) {
    throw new Error('Não foi possível ler os dados do cartão. Confira e tente de novo.');
  }
  return {
    metodo: 'cartao',
    token: formData.token,
    paymentMethodId: formData.payment_method_id,
    issuerId: formData.issuer_id ? String(formData.issuer_id) : null,
    parcelas: formData.installments,
  };
}

export function pagar(
  itens: ItemCarrinho[],
  totalCentavos: number,
  convidado: Convidado,
  pagamento: PedidoInput['pagamento'],
): Promise<PagamentoResultado> {
  const body: PedidoInput = {
    itens: itens.map((i) => ({ presenteId: i.id, quantidade: i.quantidade })),
    totalEsperadoCentavos: totalCentavos,
    convidado,
    pagamento,
    dispositivo: dispositivo(),
  };
  return api<PagamentoResultado>('/public/pagamentos', { method: 'POST', body });
}

export const consultarPedido = (pedido: string) => api<PedidoPublico>(`/public/pedidos/${pedido}`);

// ---- An order still open (a Pix waiting, or a payment being confirmed) ----

// Only the order's UUID is kept in the browser (never Mercado Pago's ids), so a guest who reloads or
// closes the tab gets it back on the next visit (the Pix code, or the confirmation) until it settles.
const PIX_ABERTO = 'nv_pedido_aberto';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lembrarPedidoAberto(pedido: string) {
  try {
    localStorage.setItem(PIX_ABERTO, pedido);
  } catch {
    // storage blocked: the order still works, it just isn't shown again after a reload
  }
}

export function pedidoEmAberto(): string | null {
  try {
    const pedido = localStorage.getItem(PIX_ABERTO);
    return pedido && UUID.test(pedido) ? pedido : null;
  } catch {
    return null;
  }
}

export function esquecerPedidoAberto() {
  try {
    localStorage.removeItem(PIX_ABERTO);
  } catch {
    // nothing to forget
  }
}
