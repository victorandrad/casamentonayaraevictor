// API contract shared by the API (apps/api) and the frontends. Types only.
import type { Taxa } from './taxas.ts';

export type { Taxa };

export type StatusResposta = 'sim' | 'nao';
export type StatusPresenca = StatusResposta | 'pendente';

export type Resposta = {
  status: StatusResposta;
  acompanhantes: number;
  mensagem: string;
  respondidoEm: string;
};

// Public
export type ConvitePublico = {
  codigo: string;
  nome: string;
  limiteAcompanhantes: number;
  resposta: Resposta | null;
};
export type RespostaInput = { status: StatusResposta; acompanhantes: number; mensagem: string };
export type Checkin = { codigo: string; nome: string; status: StatusPresenca; acompanhantes: number };
export type Recado = { id: number; nome: string; mensagem: string; criadoEm: string };
export type RecadoInput = { nome: string; mensagem: string };
// Gift category created by the couple; `icone` is one of ICONES_CATEGORIA.
export type Categoria = { id: number; nome: string; icone: string; ordem: number };
export type CategoriaInput = { nome: string; icone: string };
// Whole list layout from the panel's drag-and-drop: categories in order, each
// with its gifts in order.
export type OrganizacaoLista = Array<{ id: number; presentes: string[] }>;
export type Presente = {
  // Public identifier (UUID): the sequential database id never leaves the API.
  id: string;
  categoriaId: number;
  nome: string;
  valorCentavos: number;
  fotoUrl: string | null;
  // How many times it can be given: 1 = unique gift, N = limited, null = unlimited (cotas)
  quantidadeMaxima: number | null;
  // Still on the list (only paid units discounted); null when unlimited
  disponivel: number | null;
  // Units already paid on the site
  presenteados: number;
  // Units given outside the site, marked by the couple in the panel (they count as given)
  foraDoSite: number;
  // Units someone is paying for right now (open checkout or Pix waiting for the bank): they stay on
  // the list, but nobody else can start paying for them until that checkout ends
  emPagamento: number;
};
// `valorCentavos` of each gift is what the couple receives; guests pay it plus `taxa`.
export type ListaPresentes = { categorias: Categoria[]; presentes: Presente[]; taxa: Taxa };

// Auth
// `dono`: the panel owner (ADMIN_EMAIL), the only one who manages the other users.
export type Usuario = { id: number; email: string; nome: string; dono: boolean };
// Panel users as the owner sees them; "convidado" = invite sent, password not set yet.
export type UsuarioPainel = { id: number; email: string; nome: string; status: 'ativo' | 'convidado'; criadoEm: string; dono: boolean };
export type ConviteEnviado = { usuario: UsuarioPainel; emailEnviado: boolean; link: string };
export type ConvitePainel = { email: string; nome: string };
export type LoginInput = { email: string; senha: string };

// Admin
// Gallery photo uploaded in the panel; `momento` is one of MOMENTOS (galeria.ts).
export type FotoGaleria = { id: number; url: string; legenda: string; momento: string; ordem: number };
export type FotoGaleriaInput = { url: string; legenda: string; momento: string };

export type Resumo = {
  convidados: number;
  responderam: number;
  confirmados: number;
  pessoasConfirmadas: number;
  recusaram: number;
  pendentes: number;
  recados: number;
  recadosOcultos: number;
  presentes: number;
  presentesRecebidos: number;
  totalRecebidoCentavos: number;
  totalTaxasCentavos: number;
  totalLiquidoCentavos: number;
};
export type ConvidadoAdmin = {
  id: number;
  codigo: string;
  nome: string;
  limiteAcompanhantes: number;
  criadoEm: string;
  resposta: Resposta | null;
};
export type ConvidadoInput = { nome: string; limiteAcompanhantes: number };
export type RecadoAdmin = Recado & { visivel: boolean };
export type PresenteInput = Omit<Presente, 'id' | 'disponivel' | 'presenteados' | 'emPagamento' | 'foraDoSite'>;
export type Configuracoes = { taxa: Taxa };
export type AplicacaoMercadoPagoInput = { clientId: string; clientSecret: string };
// Public Key and Access Token of an application's credentials, pasted instead of connecting with OAuth.
export type CredenciaisMercadoPagoInput = { publicKey: string; accessToken: string; producao: boolean };
// The Mercado Pago account that receives the gifts, connected from the panel (OAuth).
// `aplicacao`: the Mercado Pago application registered in the panel (its secret never comes back);
// `urlDeRetorno`: the redirect URL to register in that application.
// The last error Mercado Pago answered with (panel only, to diagnose the setup).
export type ErroMercadoPago = { quando: string; status: number | null; caminho: string; codigo: string | null; mensagem: string | null };
export type ContaMercadoPago = {
  urlDeRetorno: string;
  ultimoErro?: ErroMercadoPago | null;
  aplicacao: { clientId: string } | null;
  conta: {
    usuarioId: string;
    apelido: string | null;
    email: string | null;
    producao: boolean; // false for a Mercado Pago test account
    conectadaEm: string;
    conectadaPor: string | null;
    expiraEm: string | null; // OAuth authorization, renewed automatically before this
    origem: 'oauth' | 'credenciais'; // connected with the button, or with pasted credentials
    precisaReconectar: boolean; // connected before the in-site checkout (no public key yet)
  } | null;
};

// Gift orders (Mercado Pago Checkout Pro; older ones went through Stripe)
// 'estornado': refunded or charged back after being paid; the gifts are free again.
export type StatusPedido = 'pendente' | 'aguardando' | 'pago' | 'falhou' | 'expirado' | 'estornado';
// Paying inside the site (Checkout Transparente). `pagamento` comes from Mercado Pago's Payment Brick:
// for a card, the one-time token it created (card data never reaches the site); never an amount,
// which the API takes from the database. `dispositivo`: Mercado Pago's device id, for anti-fraud.
// `cpf` is only passed on to Mercado Pago, never stored. `totalEsperadoCentavos`: the total the guest
// saw; it is never the price, only compared, so a price changed meanwhile isn't charged silently.
export type PedidoInput = {
  itens: Array<{ presenteId: string; quantidade: number }>;
  totalEsperadoCentavos: number;
  convidado: { nome: string; email: string; mensagem: string; cpf: string };
  pagamento: { metodo: 'cartao'; token: string; paymentMethodId: string; issuerId: string | null; parcelas: number } | { metodo: 'pix' };
  dispositivo?: string;
};
// `pedido`: the order's public UUID, the only order identifier the browser keeps. `motivo`: why a
// card was refused, in words for the guest.
export type PagamentoResultado = { pedido: string; status: StatusPedido; motivo?: string };
// A Pix waiting to be paid (shown again if the guest reloads the page).
export type PixPendente = { codigo: string; qrBase64: string | null; expiraEm: string | null };
export type ItemPedido = { nome: string; quantidade: number; valorCentavos: number };
export type PedidoPublico = {
  status: StatusPedido;
  nome: string;
  subtotalCentavos: number; // gifts only (what the couple receives)
  totalCentavos: number; // charged to the guest, fee included
  itens: ItemPedido[];
  pix: PixPendente | null; // while a Pix waits to be paid
};
export type PedidoAdmin = Omit<PedidoPublico, 'pix'> & {
  id: string; // public identifier (UUID)
  numero: string; // short code shown to people (first part of the UUID)
  email: string;
  mensagem: string;
  criadoEm: string;
  pagoEm: string | null;
  // Filled from the payment once it settles (null while unknown)
  formaPagamento: string | null;
  bandeira: string | null;
  taxaCentavos: number | null;
  liquidoCentavos: number | null;
  reciboEnviadoEm: string | null;
};

// What the Content Security Policy blocked (or would block, in report-only mode), grouped.
export type AvisoCsp = { diretiva: string; bloqueado: string; pagina: string; quantidade: number; ultimo: string };
export type AvisosCsp = { desde: string; avisos: AvisoCsp[] };

export type ApiErro = { erro: string };
