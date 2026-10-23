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
export type OrganizacaoLista = Array<{ id: number; presentes: number[] }>;
export type Presente = {
  id: number;
  categoriaId: number;
  nome: string;
  valorCentavos: number;
  fotoUrl: string | null;
  // How many times it can be given: 1 = unique gift, N = limited, null = unlimited (cotas)
  quantidadeMaxima: number | null;
  // Still available (paid and in-checkout units discounted); null when unlimited
  disponivel: number | null;
  // Units already paid
  presenteados: number;
};
// `valorCentavos` of each gift is what the couple receives; guests pay it plus `taxa`.
export type ListaPresentes = { categorias: Categoria[]; presentes: Presente[]; taxa: Taxa };

// Auth
export type Usuario = { id: number; email: string; nome: string };
export type LoginInput = { email: string; senha: string };

// Admin
// Gallery photo uploaded in the panel; `momento` is one of MOMENTOS (galeria.ts).
export type FotoGaleria = { id: number; url: string; legenda: string; momento: string; ordem: number };
export type FotoGaleriaInput = { url: string; legenda: string; momento: string };

// Mailboxes of the couple's own mail server, managed in the panel (E-mails tab).
export type CaixaEmail = { endereco: string };
export type ApelidoEmail = { endereco: string; destinos: string[] };
export type EmailsAdmin = {
  disponivel: boolean; // false when the mail server is not set up here (e.g. local dev)
  dominio: string;
  caixas: CaixaEmail[];
  apelidos: ApelidoEmail[];
  // Mailbox whose password is the panel login's (ADMIN_PASSWORD); managed by the deploy, not here.
  caixaDoPainel: string | null;
  servidor: { imap: string; smtp: string; webmail: string };
};

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
export type PresenteInput = Omit<Presente, 'id' | 'disponivel' | 'presenteados'>;
export type Configuracoes = { taxa: Taxa };

// Gift orders (Stripe Checkout)
export type StatusPedido = 'pendente' | 'aguardando' | 'pago' | 'falhou' | 'expirado';
export type PedidoInput = {
  itens: Array<{ presenteId: number; quantidade: number }>;
  convidado: { nome: string; email: string; mensagem: string };
};
export type PedidoCriado = { url: string };
export type ItemPedido = { nome: string; quantidade: number; valorCentavos: number };
export type PedidoPublico = {
  status: StatusPedido;
  nome: string;
  subtotalCentavos: number; // gifts only (what the couple receives)
  totalCentavos: number; // charged to the guest, fee included
  itens: ItemPedido[];
};
export type PedidoAdmin = PedidoPublico & {
  id: number;
  email: string;
  mensagem: string;
  criadoEm: string;
  pagoEm: string | null;
  // Filled from Stripe once the payment settles (null while unknown)
  formaPagamento: string | null;
  bandeira: string | null;
  taxaCentavos: number | null;
  liquidoCentavos: number | null;
  reciboEnviadoEm: string | null;
};

export type ApiErro = { erro: string };
