import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Usuario } from '@nv/shared/types';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, len: 64 };

export const SESSION_COOKIE = 'nv_session';

// Stored as scrypt$N$r$p$salt$hash so parameters can change later.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.len, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const ehDono = (email: string) => !!config.ownerEmail && email.toLowerCase() === config.ownerEmail;

export async function createSession(usuarioId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000);
  await query('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1, $2, $3)', [
    sha256(token),
    usuarioId,
    expiresAt,
  ]);
  // Opportunistic cleanup of expired sessions
  await query('DELETE FROM sessoes WHERE expira_em < now()');
  return { token, expiresAt };
}

export async function destroySession(token: string | undefined) {
  if (token) await query('DELETE FROM sessoes WHERE token_hash = $1', [sha256(token)]);
}

export async function userFromSession(token: string | undefined): Promise<Usuario | null> {
  if (!token) return null;
  const row = await queryOne<Omit<Usuario, 'dono'>>(
    `SELECT u.id, u.email, u.nome FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = $1 AND s.expira_em > now()`,
    [sha256(token)],
  );
  return row ? { ...row, dono: ehDono(row.email) } : null;
}

// Logs out every other device of this user (after a password change).
export async function destroyOtherSessions(usuarioId: number, tokenAtual: string | undefined) {
  await query('DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2', [usuarioId, sha256(tokenAtual ?? '')]);
}

export function sessionCookieOptions(expires?: Date) {
  return {
    path: '/api',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    ...(expires ? { expires } : {}),
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: Usuario;
  }
}

// preHandler for /api/admin routes
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const usuario = await userFromSession(request.cookies[SESSION_COOKIE]);
  if (!usuario) return reply.code(401).send({ erro: 'Faça login para continuar.' });
  request.usuario = usuario;
}

// preHandler for the owner-only routes (user management); runs after requireAuth.
export async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  if (!request.usuario?.dono) return reply.code(403).send({ erro: 'Só o dono do painel pode gerenciar os usuários.' });
}

// Small in-memory limiter (one API instance is plenty for a wedding site).
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    // Returns true when the key is over the limit.
    hit(key: string): boolean {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt < now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return false;
      }
      entry.count += 1;
      return entry.count > max;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
