import type { FastifyInstance } from 'fastify';
import type { PagamentoResultado, PedidoInput } from '@nv/shared/types';
import { rateLimiter } from '../auth.ts';
import { ContaNaoConectada, PagamentoRecusadoPeloMercadoPago } from '../mercadopago.ts';
import { chavePublica } from '../mercadopagoConta.ts';
import { abrirLink, criarLink, LinkExpirado, MAX_ITENS_LINK, type ItemLink } from '../linkCheckout.ts';
import { MOTIVO_PADRAO, pagamentoDisponivel, pagar, PedidoInvalido, pedidoPorUid } from '../pedidos.ts';

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

// Layers against card testing (someone running stolen cards through the form): a cap on payment
// attempts per IP, a lower one on refused cards per IP and per e-mail, and one for the whole site
// (an attacker can change IP and e-mail, not the site). Past them, cards are blocked for the hour;
// Pix is still allowed. After a couple of refusals the reason is no longer detailed ("insufficient
// funds" tells a tester the card is live). Pix has its own cap, since each one holds gifts.
const HORA = 60 * 60_000;
const tentativasLimiter = rateLimiter(15, HORA);
const recusasLimiter = rateLimiter(5, HORA);
const recusasNoSiteLimiter = rateLimiter(40, HORA);
const detalheLimiter = rateLimiter(2, HORA);
const pixLimiter = rateLimiter(5, HORA);
const SITE = 'site';
const linkLimiter = rateLimiter(120, 60_000);

// CPF check digits (Mercado Pago also checks, but a typo is caught here with a clear message).
function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

export async function pedidosRoutes(app: FastifyInstance) {
  // What the payment form needs: the connected account's public key (public by design).
  app.get('/pagamento', async () => {
    const publicKey = await chavePublica();
    return { disponivel: publicKey !== null, publicKey };
  });

  app.post<{ Body: PedidoInput }>(
    '/pagamentos',
    {
      schema: {
        body: {
          type: 'object',
          required: ['itens', 'totalEsperadoCentavos', 'convidado', 'pagamento'],
          additionalProperties: false,
          properties: {
            itens: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                type: 'object',
                required: ['presenteId', 'quantidade'],
                additionalProperties: false,
                properties: {
                  presenteId: { type: 'string', pattern: UUID },
                  quantidade: { type: 'integer', minimum: 1, maximum: 10 },
                },
              },
            },
            totalEsperadoCentavos: { type: 'integer', minimum: 1, maximum: 100_000_000 },
            convidado: {
              type: 'object',
              required: ['nome', 'email', 'mensagem', 'cpf'],
              additionalProperties: false,
              properties: {
                nome: { type: 'string', minLength: 1, maxLength: 120 },
                email: { type: 'string', minLength: 3, maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$' },
                mensagem: { type: 'string', maxLength: 500 },
                cpf: { type: 'string', pattern: '^\\d{11}$' },
              },
            },
            // One flat object (not oneOf: Fastify's removeAdditional would strip a card's fields while
            // trying the Pix branch); the card fields are required in the handler.
            pagamento: {
              type: 'object',
              required: ['metodo'],
              additionalProperties: false,
              properties: {
                metodo: { enum: ['cartao', 'pix'] },
                token: { type: 'string', pattern: '^[A-Za-z0-9-]{8,100}$' },
                paymentMethodId: { type: 'string', pattern: '^[a-z_]{2,30}$' },
                issuerId: { type: ['string', 'null'], pattern: '^[0-9]{1,15}$' },
                parcelas: { type: 'integer', minimum: 1, maximum: 12 },
              },
            },
            dispositivo: { type: 'string', pattern: '^[A-Za-z0-9:_-]{1,200}$' },
          },
        },
      },
    },
    async (req, reply): Promise<PagamentoResultado | void> => {
      if (!(await pagamentoDisponivel())) return reply.code(503).send({ erro: 'O pagamento online ainda não está disponível. Tente mais tarde.' });
      const nome = req.body.convidado.nome.trim();
      const email = req.body.convidado.email.trim().toLowerCase();
      if (!nome) return reply.code(400).send({ erro: 'Informe seu nome.' });
      if (!cpfValido(req.body.convidado.cpf)) return reply.code(400).send({ erro: 'Confira o CPF: ele não parece válido.' });
      if (tentativasLimiter.hit(req.ip)) {
        return reply.code(429).send({ erro: 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.' });
      }
      const p = req.body.pagamento as Partial<{ metodo: string; token: string; paymentMethodId: string; issuerId: string | null; parcelas: number }>;
      const cartao = p.metodo === 'cartao';
      if (cartao && (!p.token || !p.paymentMethodId || !p.parcelas)) return reply.code(400).send({ erro: 'Dados do cartão incompletos.' });
      const dados: PedidoInput['pagamento'] = cartao
        ? { metodo: 'cartao', token: p.token!, paymentMethodId: p.paymentMethodId!, issuerId: p.issuerId ?? null, parcelas: p.parcelas! }
        : { metodo: 'pix' };
      if (cartao && (recusasLimiter.excedido(req.ip) || recusasLimiter.excedido(email) || recusasNoSiteLimiter.excedido(SITE))) {
        return reply.code(429).send({ erro: 'Muitos cartões recusados seguidos. Por segurança, use o Pix ou tente de novo daqui a uma hora.' });
      }
      if (!cartao && pixLimiter.hit(req.ip)) {
        return reply.code(429).send({ erro: 'Muitos Pix gerados seguidos. Pague os que já foram gerados ou tente de novo mais tarde.' });
      }
      // `pelaOperadora`: a real card refusal (not junk the API rejected), the only kind that counts
      // toward the site-wide cap, so nobody can switch cards off for everyone with fake tokens.
      const recusado = (pelaOperadora: boolean) => {
        recusasLimiter.hit(req.ip);
        recusasLimiter.hit(email);
        if (pelaOperadora) recusasNoSiteLimiter.hit(SITE);
        const ip = detalheLimiter.hit(req.ip);
        return detalheLimiter.hit(email) || ip;
      };
      try {
        const resultado = await pagar({
          itens: req.body.itens,
          totalEsperadoCentavos: req.body.totalEsperadoCentavos,
          pagamento: dados,
          dispositivo: req.body.dispositivo,
          convidado: { nome, email, mensagem: req.body.convidado.mensagem.trim(), cpf: req.body.convidado.cpf },
        });
        if (cartao && resultado.status === 'falhou' && recusado(true)) resultado.motivo = MOTIVO_PADRAO;
        req.log.info({ pedido: resultado.pedido, metodo: dados.metodo, status: resultado.status }, 'pagamento criado');
        return resultado;
      } catch (error) {
        if (error instanceof PedidoInvalido) return reply.code(400).send({ erro: error.message });
        if (error instanceof ContaNaoConectada) {
          req.log.warn({ err: error.message }, 'Mercado Pago recusou o Access Token da conta');
          return reply.code(503).send({ erro: 'O pagamento online ainda não está disponível. Tente mais tarde.' });
        }
        if (error instanceof PagamentoRecusadoPeloMercadoPago) {
          if (cartao) recusado(false);
          req.log.warn({ err: error.message }, 'pagamento recusado pelo Mercado Pago');
          return reply.code(400).send({ erro: 'Não foi possível processar este pagamento. Confira os dados e tente de novo.' });
        }
        req.log.error(error, 'falha ao criar o pagamento');
        return reply.code(502).send({ erro: 'Não foi possível iniciar o pagamento agora. Tente de novo em instantes.' });
      }
    },
  );

  // The order's own UUID identifies it here; it is unguessable.
  const pedidoParams = {
    type: 'object',
    required: ['pedido'],
    properties: { pedido: { type: 'string', pattern: UUID } },
  } as const;

  app.get<{ Params: { pedido: string } }>('/pedidos/:pedido', { schema: { params: pedidoParams } }, async (req, reply) =>
    (await pedidoPorUid(req.params.pedido)) ?? reply.code(404).send({ erro: 'Pedido não encontrado.' }),
  );
  // The encrypted link the checkout's address carries (see linkCheckout.ts).
  app.post<{ Body: { itens: ItemLink[] } }>(
    '/checkout/link',
    {
      schema: {
        body: {
          type: 'object',
          required: ['itens'],
          additionalProperties: false,
          properties: {
            itens: {
              type: 'array',
              minItems: 1,
              maxItems: MAX_ITENS_LINK,
              items: {
                type: 'object',
                required: ['presenteId', 'quantidade'],
                additionalProperties: false,
                properties: {
                  presenteId: { type: 'string', pattern: UUID },
                  quantidade: { type: 'integer', minimum: 1, maximum: 10 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (linkLimiter.hit(req.ip)) return reply.code(429).send({ erro: 'Muitas alterações seguidas. Aguarde um instante.' });
      const ids = new Set(req.body.itens.map((i) => i.presenteId.toLowerCase()));
      if (ids.size !== req.body.itens.length) return reply.code(400).send({ erro: 'Presente repetido no carrinho.' });
      return criarLink(req.body.itens.map((i) => ({ ...i, presenteId: i.presenteId.toLowerCase() })));
    },
  );

  app.get<{ Params: { link: string } }>(
    '/checkout/link/:link',
    { schema: { params: { type: 'object', required: ['link'], properties: { link: { type: 'string', pattern: '^[A-Za-z0-9_-]{44,1200}$' } } } } },
    async (req, reply) => {
      if (linkLimiter.hit(req.ip)) return reply.code(429).send({ erro: 'Muitas tentativas seguidas. Aguarde um instante.' });
      try {
        return abrirLink(req.params.link);
      } catch (error) {
        if (error instanceof LinkExpirado) return reply.code(410).send({ erro: 'Este link de presentes expirou. Escolha os presentes de novo na lista.' });
        return reply.code(400).send({ erro: 'Este link de presentes não é válido. Escolha os presentes na lista.' });
      }
    },
  );
}
