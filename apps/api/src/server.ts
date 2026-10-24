import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.ts';
import { pool } from './db.ts';
import { migrate } from './migrate.ts';
import { publicRoutes } from './routes/public.ts';
import { authRoutes } from './routes/auth.ts';
import { adminRoutes } from './routes/admin.ts';
import { pedidosRoutes } from './routes/pedidos.ts';
import { stripeWebhookRoutes } from './routes/stripe.ts';
import { mercadoPagoWebhookRoutes } from './routes/mercadopago.ts';
import { garantirPastaUploads, MAX_UPLOAD_BYTES, UPLOADS_PREFIX } from './uploads.ts';

const app = Fastify({
  logger: { level: config.isProduction ? 'info' : 'debug', redact: ['req.headers.cookie', 'res.headers["set-cookie"]'] },
  trustProxy: true,
  bodyLimit: 32 * 1024,
});

await app.register(cookie);
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } });

// Uploaded photos have random, never-reused names, so they can be cached forever.
await garantirPastaUploads();
await app.register(fastifyStatic, {
  root: config.uploadsDir,
  prefix: UPLOADS_PREFIX,
  index: false,
  list: false,
  dotfiles: 'deny',
  immutable: true,
  maxAge: '365d',
  setHeaders: (res) => res.header('X-Content-Type-Options', 'nosniff'),
});

// Writes must come from the site itself: the session cookie is SameSite=Lax and
// we additionally reject cross-site browser requests by Origin.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.addHook('onRequest', async (req, reply) => {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) {
    return reply.code(403).send({ erro: 'Origem não permitida.' });
  }
});

app.setErrorHandler((error: { validation?: unknown; statusCode?: number; message: string }, req, reply) => {
  if (error.validation) return reply.code(400).send({ erro: 'Dados inválidos. Confira os campos e tente de novo.' });
  if (error.statusCode && error.statusCode < 500) return reply.code(error.statusCode).send({ erro: error.message });
  req.log.error(error);
  return reply.code(500).send({ erro: 'Algo deu errado. Tente novamente em instantes.' });
});

app.get('/api/health', async () => {
  await pool.query('SELECT 1');
  return { ok: true };
});
await app.register(publicRoutes, { prefix: '/api/public' });
await app.register(pedidosRoutes, { prefix: '/api/public' });
await app.register(stripeWebhookRoutes, { prefix: '/api/stripe' });
await app.register(mercadoPagoWebhookRoutes, { prefix: '/api/mercadopago' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(adminRoutes, { prefix: '/api/admin' });

await migrate((msg) => app.log.info(msg));
await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
