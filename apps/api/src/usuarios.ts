// Panel users: the owner (ADMIN_EMAIL) invites others by e-mail; each invite is a single-use link,
// valid for a few days, where the person sets their own password.
import { randomBytes } from 'node:crypto';
import type { ConvitePainel, Usuario, UsuarioPainel } from '@nv/shared/types';
import { createSession, ehDono, hashPassword, sha256, verifyPassword } from './auth.ts';
import { config } from './config.ts';
import { query, queryOne, transaction } from './db.ts';
import { enviarConviteUsuario, enviarRecuperacaoSenha } from './email.ts';

export const SENHA_MINIMA = 10;

export class ErroUsuario extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type UsuarioRow = { id: number; email: string; nome: string; senha_hash: string | null; criado_em: Date };

const paraPainel = (r: UsuarioRow): UsuarioPainel => ({
  id: r.id,
  email: r.email,
  nome: r.nome,
  status: r.senha_hash ? 'ativo' : 'convidado',
  criadoEm: r.criado_em.toISOString(),
  dono: ehDono(r.email),
});

export async function listar(): Promise<UsuarioPainel[]> {
  const rows = await query<UsuarioRow>('SELECT id, email, nome, senha_hash, criado_em FROM usuarios ORDER BY criado_em, id');
  return rows.map(paraPainel).sort((a, b) => Number(b.dono) - Number(a.dono));
}

type TipoLink = 'convite' | 'recuperacao';
const linkDoConvite = (token: string) => `${config.siteUrl}/painel#definir-senha=${token}`;
const linkDeRecuperacao = (token: string) => `${config.siteUrl}/painel#redefinir-senha=${token}`;

// New single-use link of this kind for the user (the previous one of the same kind stops working).
async function novoToken(usuarioId: number, tipo: TipoLink, minutos: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await transaction(async (client) => {
    await client.query('DELETE FROM convites_usuario WHERE usuario_id = $1 AND tipo = $2', [usuarioId, tipo]);
    await client.query(
      `INSERT INTO convites_usuario (token_hash, usuario_id, tipo, expira_em) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
      [sha256(token), usuarioId, tipo, minutos],
    );
  });
  return token;
}

const novoConvite = (usuarioId: number) => novoToken(usuarioId, 'convite', config.inviteDays * 24 * 60);

async function enviar(usuario: UsuarioRow, convidadoPor: string): Promise<{ emailEnviado: boolean; link: string }> {
  const link = linkDoConvite(await novoConvite(usuario.id));
  try {
    await enviarConviteUsuario({ nome: usuario.nome, email: usuario.email, convidadoPor, link, validadeDias: config.inviteDays });
    return { emailEnviado: true, link };
  } catch (error) {
    console.error('Falha ao enviar convite do painel:', (error as Error).message);
    return { emailEnviado: false, link };
  }
}

export async function convidar(email: string, nome: string, convidadoPor: string) {
  const endereco = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endereco)) throw new ErroUsuario('Informe um e-mail válido.');
  if (await queryOne('SELECT 1 FROM usuarios WHERE email = $1', [endereco])) {
    throw new ErroUsuario('Já existe um usuário com esse e-mail.', 409);
  }
  const row = (await queryOne<UsuarioRow>(
    'INSERT INTO usuarios (email, nome, senha_hash) VALUES ($1, $2, NULL) RETURNING id, email, nome, senha_hash, criado_em',
    [endereco, nome.trim()],
  ))!;
  return { usuario: paraPainel(row), ...(await enviar(row, convidadoPor)) };
}

// Sends the invite again (only for users who have not set their password yet).
export async function reenviarConvite(id: number, convidadoPor: string) {
  const row = await queryOne<UsuarioRow>('SELECT id, email, nome, senha_hash, criado_em FROM usuarios WHERE id = $1', [id]);
  if (!row) throw new ErroUsuario('Usuário não encontrado.', 404);
  if (row.senha_hash) throw new ErroUsuario('Esse usuário já criou a senha dele.', 409);
  return { usuario: paraPainel(row), ...(await enviar(row, convidadoPor)) };
}

export async function remover(id: number, solicitante: Usuario) {
  const row = await queryOne<{ email: string }>('SELECT email FROM usuarios WHERE id = $1', [id]);
  if (!row) throw new ErroUsuario('Usuário não encontrado.', 404);
  if (id === solicitante.id || ehDono(row.email)) throw new ErroUsuario('A conta do usuário master não pode ser removida.', 409);
  await query('DELETE FROM usuarios WHERE id = $1', [id]); // sessions and invites go with it (cascade)
}

const linkValido = (token: string, tipo: TipoLink) =>
  queryOne<{ usuario_id: number; email: string; nome: string }>(
    `SELECT c.usuario_id, u.email, u.nome FROM convites_usuario c JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.token_hash = $1 AND c.tipo = $2 AND c.expira_em > now()`,
    [sha256(token), tipo],
  );
const conviteValido = (token: string) => linkValido(token, 'convite');

export async function lerConvite(token: string): Promise<ConvitePainel> {
  const convite = await conviteValido(token);
  if (!convite) throw new ErroUsuario('Este link expirou ou já foi usado. Peça um novo convite.', 404);
  return { email: convite.email, nome: convite.nome };
}

// Sets the password from the invite link and logs the person in.
export async function aceitarConvite(token: string, senha: string) {
  validarSenha(senha);
  const convite = await conviteValido(token);
  if (!convite) throw new ErroUsuario('Este link expirou ou já foi usado. Peça um novo convite.', 404);
  await transaction(async (client) => {
    await client.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [convite.usuario_id, await hashPassword(senha)]);
    await client.query('DELETE FROM convites_usuario WHERE usuario_id = $1', [convite.usuario_id]);
  });
  const sessao = await createSession(convite.usuario_id);
  const usuario: Usuario = { id: convite.usuario_id, email: convite.email, nome: convite.nome, dono: ehDono(convite.email) };
  return { usuario, sessao };
}

function validarSenha(senha: string) {
  if (senha.length < SENHA_MINIMA) throw new ErroUsuario(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
}

export async function trocarNome(id: number, nome: string): Promise<string> {
  const limpo = nome.trim();
  if (!limpo) throw new ErroUsuario('Informe o nome.');
  await query('UPDATE usuarios SET nome = $2 WHERE id = $1', [id, limpo]);
  return limpo;
}

// Changes the user's own password.
export async function trocarSenha(usuario: Usuario, atual: string, nova: string) {
  validarSenha(nova);
  const row = await queryOne<{ senha_hash: string | null }>('SELECT senha_hash FROM usuarios WHERE id = $1', [usuario.id]);
  if (!row?.senha_hash || !(await verifyPassword(atual, row.senha_hash))) throw new ErroUsuario('A senha atual não confere.', 403);
  await query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [usuario.id, await hashPassword(nova)]);
}

// ---- Recuperar a senha ----

const LINK_INVALIDO = 'Este link expirou ou já foi usado. Peça um novo na tela de login.';

// Always succeeds from the caller's point of view, so the answer never reveals who has an account.
export async function solicitarRecuperacao(email: string): Promise<void> {
  const row = await queryOne<{ id: number; email: string; nome: string }>('SELECT id, email, nome FROM usuarios WHERE email = $1', [
    email.trim().toLowerCase(),
  ]);
  if (!row) return;
  const link = linkDeRecuperacao(await novoToken(row.id, 'recuperacao', config.resetMinutes));
  try {
    await enviarRecuperacaoSenha({ nome: row.nome, email: row.email, link, validadeMinutos: config.resetMinutes });
  } catch (error) {
    console.error('Falha ao enviar recuperação de senha:', (error as Error).message);
  }
}

export async function lerRecuperacao(token: string): Promise<ConvitePainel> {
  const link = await linkValido(token, 'recuperacao');
  if (!link) throw new ErroUsuario(LINK_INVALIDO, 404);
  return { email: link.email, nome: link.nome };
}

// New password from the recovery link: every open session is closed, then the person is logged in.
export async function redefinirSenha(token: string, senha: string) {
  validarSenha(senha);
  const link = await linkValido(token, 'recuperacao');
  if (!link) throw new ErroUsuario(LINK_INVALIDO, 404);
  await transaction(async (client) => {
    await client.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [link.usuario_id, await hashPassword(senha)]);
    await client.query('DELETE FROM convites_usuario WHERE usuario_id = $1', [link.usuario_id]);
    await client.query('DELETE FROM sessoes WHERE usuario_id = $1', [link.usuario_id]);
  });
  const sessao = await createSession(link.usuario_id);
  const usuario: Usuario = { id: link.usuario_id, email: link.email, nome: link.nome, dono: ehDono(link.email) };
  return { usuario, sessao };
}
