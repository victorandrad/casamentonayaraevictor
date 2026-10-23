import type { FastifyInstance } from 'fastify';
import type { LoginInput, Usuario } from '@nv/shared/types';
import {
  createSession,
  destroySession,
  rateLimiter,
  SESSION_COOKIE,
  sessionCookieOptions,
  userFromSession,
  verifyPassword,
} from '../auth.ts';
import { queryOne } from '../db.ts';

const loginLimiter = rateLimiter(5, 15 * 60_000);
// Compared against when the e-mail doesn't exist, so timing doesn't reveal accounts.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginInput }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'senha'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 200 },
            senha: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const limitKey = `${req.ip}|${email}`;
      if (loginLimiter.hit(limitKey)) {
        return reply.code(429).send({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
      }

      const row = await queryOne<Usuario & { senha_hash: string }>(
        'SELECT id, email, nome, senha_hash FROM usuarios WHERE email = $1',
        [email],
      );
      const ok = await verifyPassword(req.body.senha, row?.senha_hash ?? DUMMY_HASH);
      if (!row || !ok) return reply.code(401).send({ erro: 'E-mail ou senha incorretos.' });

      loginLimiter.reset(limitKey);
      const { token, expiresAt } = await createSession(row.id);
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
      const usuario: Usuario = { id: row.id, email: row.email, nome: row.nome };
      return { usuario };
    },
  );

  app.post('/logout', async (req, reply) => {
    await destroySession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return reply.code(204).send();
  });

  app.get('/me', async (req, reply) => {
    const usuario = await userFromSession(req.cookies[SESSION_COOKIE]);
    if (!usuario) return reply.code(401).send({ erro: 'Sessão expirada.' });
    return { usuario };
  });
}
