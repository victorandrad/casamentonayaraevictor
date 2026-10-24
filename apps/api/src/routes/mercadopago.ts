import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import { assinaturaValida, buscarPagamento } from '../mercadopago.ts';
import { aplicarPagamentoMercadoPago } from '../pedidos.ts';

// Mercado Pago webhook (Checkout Pro). The notification only says "payment <id> changed": it is
// checked against the application's secret signature, then the payment itself is fetched from
// Mercado Pago (never trusted from the request) and brought into its order.
export async function mercadoPagoWebhookRoutes(app: FastifyInstance) {
  app.post<{ Querystring: Record<string, string | undefined>; Body: { type?: string; data?: { id?: string | number } } }>(
    '/webhook',
    { bodyLimit: 64 * 1024 },
    async (req, reply) => {
      if (!config.mercadoPago.accessToken || !config.mercadoPago.webhookSecret) {
        return reply.code(503).send({ erro: 'Webhook do Mercado Pago não configurado.' });
      }
      const tipo = req.query.type ?? req.query.topic ?? req.body?.type;
      const dataId = req.query['data.id'] ?? (req.body?.data?.id !== undefined ? String(req.body.data.id) : undefined);
      // Not a Webhooks notice (e.g. an old-style IPN, which comes unsigned): acknowledge and ignore it,
      // otherwise Mercado Pago keeps retrying it.
      if (!dataId) return { recebido: true };

      const requestId = req.headers['x-request-id'];
      if (!assinaturaValida(req.headers['x-signature'] as string | undefined, typeof requestId === 'string' ? requestId : undefined, dataId)) {
        req.log.warn({ dataId }, 'assinatura do webhook do Mercado Pago inválida');
        return reply.code(401).send({ erro: 'Assinatura inválida.' });
      }

      if (tipo === 'payment' && /^\d+$/.test(dataId)) {
        try {
          const pagamento = await buscarPagamento(dataId);
          await aplicarPagamentoMercadoPago(pagamento);
          req.log.info({ pagamento: dataId, status: pagamento.status }, 'pedido atualizado pelo Mercado Pago');
        } catch (error) {
          // A 5xx makes Mercado Pago retry the notification later.
          req.log.error(error, 'falha ao consultar o pagamento no Mercado Pago');
          return reply.code(502).send({ erro: 'Falha ao consultar o pagamento.' });
        }
      }
      return { recebido: true };
    },
  );
}
