import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { config } from '../config.ts';
import { registrarEvento, sincronizarSessao, stripe } from '../pedidos.ts';

const EVENTOS_CHECKOUT = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);

// Stripe webhook. Registered in its own plugin so JSON is kept as the raw
// Buffer: the signature is computed over the exact bytes Stripe sent.
export async function stripeWebhookRoutes(app: FastifyInstance) {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.post('/webhook', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    if (!stripe || !config.stripeWebhookSecret) {
      return reply.code(503).send({ erro: 'Webhook do Stripe não configurado.' });
    }
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
      return reply.code(400).send({ erro: 'Assinatura ausente.' });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
    } catch (error) {
      req.log.warn({ err: (error as Error).message }, 'assinatura do webhook inválida');
      return reply.code(400).send({ erro: 'Assinatura inválida.' });
    }

    if (EVENTOS_CHECKOUT.has(event.type) && (await registrarEvento(event.id, event.type))) {
      await sincronizarSessao(event.data.object as Stripe.Checkout.Session, event.type);
      req.log.info({ evento: event.type, sessao: (event.data.object as { id: string }).id }, 'pedido atualizado pelo Stripe');
    }
    return { recebido: true };
  });
}
