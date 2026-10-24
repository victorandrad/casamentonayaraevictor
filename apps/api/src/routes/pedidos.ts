import type { FastifyInstance } from 'fastify';
import type { PedidoCriado, PedidoInput } from '@nv/shared/types';
import { rateLimiter } from '../auth.ts';
import { cancelarPedidoPendente, criarPedido, pagamentoDisponivel, PedidoInvalido, pedidoPorUid } from '../pedidos.ts';

const pedidosLimiter = rateLimiter(15, 60 * 60_000);
const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export async function pedidosRoutes(app: FastifyInstance) {
  app.post<{ Body: PedidoInput }>(
    '/pedidos',
    {
      schema: {
        body: {
          type: 'object',
          required: ['itens', 'convidado'],
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
            convidado: {
              type: 'object',
              required: ['nome', 'email', 'mensagem'],
              additionalProperties: false,
              properties: {
                nome: { type: 'string', minLength: 1, maxLength: 120 },
                email: { type: 'string', minLength: 3, maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$' },
                mensagem: { type: 'string', maxLength: 500 },
              },
            },
          },
        },
      },
    },
    async (req, reply): Promise<PedidoCriado | void> => {
      if (!pagamentoDisponivel()) return reply.code(503).send({ erro: 'O pagamento online ainda não está disponível. Tente mais tarde.' });
      const nome = req.body.convidado.nome.trim();
      if (!nome) return reply.code(400).send({ erro: 'Informe seu nome.' });
      if (pedidosLimiter.hit(req.ip)) {
        return reply.code(429).send({ erro: 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.' });
      }
      try {
        return await criarPedido({
          itens: req.body.itens,
          convidado: { nome, email: req.body.convidado.email.trim(), mensagem: req.body.convidado.mensagem.trim() },
        });
      } catch (error) {
        if (error instanceof PedidoInvalido) return reply.code(400).send({ erro: error.message });
        req.log.error(error, 'falha ao criar a página de pagamento');
        return reply.code(502).send({ erro: 'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.' });
      }
    },
  );

  // The order's own UUID (from the return URL) identifies it here; it is unguessable.
  const pedidoParams = {
    type: 'object',
    required: ['pedido'],
    properties: { pedido: { type: 'string', pattern: UUID } },
  } as const;

  app.get<{ Params: { pedido: string } }>('/pedidos/:pedido', { schema: { params: pedidoParams } }, async (req, reply) =>
    (await pedidoPorUid(req.params.pedido)) ?? reply.code(404).send({ erro: 'Pedido não encontrado.' }),
  );

  app.post<{ Params: { pedido: string } }>('/pedidos/:pedido/cancelar', { schema: { params: pedidoParams } }, async (req, reply) => {
    await cancelarPedidoPendente(req.params.pedido);
    return reply.code(204).send();
  });
}
