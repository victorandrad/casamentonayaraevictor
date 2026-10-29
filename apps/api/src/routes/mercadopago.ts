import type { FastifyInstance } from 'fastify';
import { buscarPagamento, ContaNaoConectada } from '../mercadopago.ts';
import { aplicarPagamentoMercadoPago } from '../pedidos.ts';

// Mercado Pago webhook (Checkout Pro). Each preference sends its notices here (notification_url), so
// nothing needs setting up in the application. The notice only says "payment <id> changed": the
// payment itself is always fetched from Mercado Pago with the connected account's token (never
// trusted from the request), so a forged notice can at most make us re-read a real payment.
export async function mercadoPagoWebhookRoutes(app: FastifyInstance) {
  app.post<{ Querystring: Record<string, string | undefined>; Body: { type?: string; data?: { id?: string | number } } }>(
    '/webhook',
    { bodyLimit: 64 * 1024 },
    async (req, reply) => {
      const tipo = req.query.type ?? req.query.topic ?? req.body?.type;
      const dataId = req.query['data.id'] ?? (req.body?.data?.id !== undefined ? String(req.body.data.id) : undefined);
      // Not a Webhooks notice (e.g. an old-style IPN): acknowledge and ignore it, otherwise Mercado
      // Pago keeps retrying it.
      if (!dataId) return { recebido: true };

      if (tipo === 'payment' && /^\d+$/.test(dataId)) {
        try {
          const pagamento = await buscarPagamento(dataId);
          await aplicarPagamentoMercadoPago(pagamento);
          req.log.info({ pagamento: dataId, status: pagamento.status }, 'pedido atualizado pelo Mercado Pago');
        } catch (error) {
          // No account connected (it was disconnected in the panel): nothing to update.
          if (error instanceof ContaNaoConectada) return { recebido: true };
          // A 5xx makes Mercado Pago retry the notification later.
          req.log.error(error, 'falha ao consultar o pagamento no Mercado Pago');
          return reply.code(502).send({ erro: 'Falha ao consultar o pagamento.' });
        }
      }
      return { recebido: true };
    },
  );
}
