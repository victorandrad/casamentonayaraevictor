import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.ts';
import { pool } from './db.ts';
import { conciliarPendentes } from './pedidos.ts';
import { migrate } from './migrate.ts';
import { publicRoutes } from './routes/public.ts';
import { authRoutes } from './routes/auth.ts';
import { adminRoutes } from './routes/admin.ts';
import { pedidosRoutes } from './routes/pedidos.ts';
import { mercadoPagoWebhookRoutes } from './routes/mercadopago.ts';
import { cspRoutes } from './routes/csp.ts';
import { garantirPastaUploads, MAX_UPLOAD_BYTES, UPLOADS_PREFIX } from './uploads.ts';

const app = Fastify({
  logger: { level: config.isProduction ? 'info' : 'debug', redact: ['req.headers.cookie', 'res.headers["set-cookie"]'] },
  // Exactly the proxies in front of the API (Traefik, then the site's nginx): req.ip is the address
  // Traefik saw, so a client can't pick its own IP with a forged X-Forwarded-For (the rate limits
  // on payments rely on it).
  trustProxy: (_endereco: string, salto: number) => salto < 2,
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
await app.register(mercadoPagoWebhookRoutes, { prefix: '/api/mercadopago' });
await app.register(cspRoutes, { prefix: '/api' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(adminRoutes, { prefix: '/api/admin' });

await migrate((msg) => app.log.info(msg));
await app.listen({ port: config.port, host: '0.0.0.0' });

// Payments Mercado Pago didn't answer clearly get settled in the background.
const conciliacao = setInterval(() => void conciliarPendentes().catch((error) => app.log.warn(error)), 2 * 60_000);
conciliacao.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
