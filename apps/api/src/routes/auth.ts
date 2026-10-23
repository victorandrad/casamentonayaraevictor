import type { FastifyInstance } from 'fastify';
import type { LoginInput, Usuario } from '@nv/shared/types';
import {
  createSession,
  destroySession,
  ehDono,
  rateLimiter,
  SESSION_COOKIE,
  sessionCookieOptions,
  userFromSession,
  verifyPassword,
} from '../auth.ts';
import { queryOne } from '../db.ts';
import { aceitarConvite, ErroUsuario, lerConvite, lerRecuperacao, redefinirSenha, SENHA_MINIMA, solicitarRecuperacao } from '../usuarios.ts';

const loginLimiter = rateLimiter(5, 15 * 60_000);
const conviteLimiter = rateLimiter(20, 15 * 60_000);
// Recovery e-mails: a few per address and per IP, so the form can't be used to flood an inbox.
const recuperarPorEmail = rateLimiter(3, 60 * 60_000);
const recuperarPorIp = rateLimiter(10, 60 * 60_000);
const tokenParams = {
  type: 'object',
  required: ['token'],
  properties: { token: { type: 'string', minLength: 20, maxLength: 100, pattern: '^[A-Za-z0-9_-]+$' } },
} as const;
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

      const row = await queryOne<Omit<Usuario, 'dono'> & { senha_hash: string | null }>(
        'SELECT id, email, nome, senha_hash FROM usuarios WHERE email = $1',
        [email],
      );
      const ok = await verifyPassword(req.body.senha, row?.senha_hash ?? DUMMY_HASH);
      if (!row || !ok) return reply.code(401).send({ erro: 'E-mail ou senha incorretos.' });

      loginLimiter.reset(limitKey);
      const { token, expiresAt } = await createSession(row.id);
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
      const usuario: Usuario = { id: row.id, email: row.email, nome: row.nome, dono: ehDono(row.email) };
      return { usuario };
    },
  );

  app.post('/logout', async (req, reply) => {
    await destroySession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return reply.code(204).send();
  });

  // Invite link from the e-mail: who it is for, then create the password (and log in).
  app.get<{ Params: { token: string } }>('/convite/:token', { schema: { params: tokenParams } }, async (req, reply) => {
    if (conviteLimiter.hit(req.ip)) return reply.code(429).send({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    try {
      return await lerConvite(req.params.token);
    } catch (error) {
      if (error instanceof ErroUsuario) return reply.code(error.status).send({ erro: error.message });
      throw error;
    }
  });

  app.post<{ Params: { token: string }; Body: { senha: string } }>(
    '/convite/:token',
    {
      schema: {
        params: tokenParams,
        body: {
          type: 'object',
          required: ['senha'],
          additionalProperties: false,
          properties: { senha: { type: 'string', minLength: SENHA_MINIMA, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      if (conviteLimiter.hit(req.ip)) return reply.code(429).send({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
      try {
        const { usuario, sessao } = await aceitarConvite(req.params.token, req.body.senha);
        reply.setCookie(SESSION_COOKIE, sessao.token, sessionCookieOptions(sessao.expiresAt));
        return { usuario };
      } catch (error) {
        if (error instanceof ErroUsuario) return reply.code(error.status).send({ erro: error.message });
        throw error;
      }
    },
  );

  // "Esqueci minha senha": always the same answer, whether or not the e-mail has an account.
  app.post<{ Body: { email: string } }>(
    '/recuperar-senha',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', minLength: 3, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      if (recuperarPorIp.hit(req.ip)) {
        return reply.code(429).send({ erro: 'Muitos pedidos. Aguarde um pouco e tente de novo.' });
      }
      // Not awaited: the response time is the same whether or not the account exists.
      if (!recuperarPorEmail.hit(email)) {
        solicitarRecuperacao(email).catch((error) => req.log.error(error, 'falha na recuperação de senha'));
      }
      return { enviado: true };
    },
  );

  app.get<{ Params: { token: string } }>('/redefinir/:token', { schema: { params: tokenParams } }, async (req, reply) => {
    if (conviteLimiter.hit(req.ip)) return reply.code(429).send({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    try {
      return await lerRecuperacao(req.params.token);
    } catch (error) {
      if (error instanceof ErroUsuario) return reply.code(error.status).send({ erro: error.message });
      throw error;
    }
  });

  app.post<{ Params: { token: string }; Body: { senha: string } }>(
    '/redefinir/:token',
    {
      schema: {
        params: tokenParams,
        body: {
          type: 'object',
          required: ['senha'],
          additionalProperties: false,
          properties: { senha: { type: 'string', minLength: SENHA_MINIMA, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      if (conviteLimiter.hit(req.ip)) return reply.code(429).send({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
      try {
        const { usuario, sessao } = await redefinirSenha(req.params.token, req.body.senha);
        reply.setCookie(SESSION_COOKIE, sessao.token, sessionCookieOptions(sessao.expiresAt));
        return { usuario };
      } catch (error) {
        if (error instanceof ErroUsuario) return reply.code(error.status).send({ erro: error.message });
        throw error;
      }
    },
  );

  app.get('/me', async (req, reply) => {
    const usuario = await userFromSession(req.cookies[SESSION_COOKIE]);
    if (!usuario) return reply.code(401).send({ erro: 'Sessão expirada.' });
    return { usuario };
  });
}
