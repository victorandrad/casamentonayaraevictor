// The Mercado Pago account that receives the gifts, connected from the panel with one click
// (OAuth authorization code + PKCE). The application the account authorizes (Client ID and
// Client Secret) is also registered in the panel, once; nothing about Mercado Pago lives in the
// server's environment. Secrets and tokens are kept encrypted and the tokens renewed before expiring.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type { ContaMercadoPago } from '@nv/shared/types';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';

const API = 'https://api.mercadopago.com';
const AUTORIZACAO = 'https://auth.mercadopago.com/authorization';
// Mercado Pago sends the couple back here; it must be registered as a redirect URL in the application.
export const urlDeRetorno = () => `${config.siteUrl}/api/admin/mercadopago/retorno`;
// Tokens last 180 days; renew a month ahead so a quiet month never leaves the site unable to charge.
const RENOVAR_ANTES_DIAS = 30;

export class ErroConexao extends Error {}

// ---- Encryption of what is stored ----

// The key comes from the database password, which is in the server's environment but not in the
// database: a dump or backup alone can't be decrypted. Changing that password means registering
// the application and connecting the account again.
const chave = () => {
  const url = new URL(config.databaseUrl);
  return Buffer.from(hkdfSync('sha256', decodeURIComponent(url.password) || config.databaseUrl, 'nv-mercadopago', 'segredos', 32));
};

function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return ['v1', iv.toString('base64'), cifra.getAuthTag().toString('base64'), dados.toString('base64')].join(':');
}

function decifrar(guardado: string): string {
  const [versao, iv, tag, dados] = guardado.split(':');
  if (versao !== 'v1' || !iv || !tag || !dados) throw new Error('segredo guardado em formato desconhecido');
  const decifra = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'));
  decifra.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decifra.update(Buffer.from(dados, 'base64')), decifra.final()]).toString('utf8');
}

// ---- The application (Client ID and Client Secret) ----

type Aplicacao = { clientId: string; clientSecret: string };

async function lerAplicacao(): Promise<Aplicacao | null> {
  const linha = await queryOne<{ client_id: string; client_secret: string }>('SELECT client_id, client_secret FROM mercadopago_aplicacao');
  if (!linha) return null;
  try {
    return { clientId: linha.client_id, clientSecret: decifrar(linha.client_secret) };
  } catch {
    console.warn('client secret do Mercado Pago ilegível (a senha do banco mudou?): cadastre a aplicação de novo no painel');
    return null;
  }
}

async function pedirTokens(aplicacao: Aplicacao, corpo: Record<string, string>): Promise<Tokens> {
  const resposta = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: aplicacao.clientId, client_secret: aplicacao.clientSecret, ...corpo }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new ErroConexao(`Mercado Pago ${resposta.status} em /oauth/token: ${detalhe.slice(0, 300)}`);
  }
  return (await resposta.json()) as Tokens;
}

// Saves the application typed in the panel. The pair is checked with Mercado Pago first (a
// client_credentials token only works when both are right). A different application can't use the
// connected account's tokens, so switching applications disconnects the account.
export async function salvarAplicacao(clientId: string, clientSecret: string, usuarioId: number): Promise<void> {
  try {
    await pedirTokens({ clientId, clientSecret }, { grant_type: 'client_credentials' });
  } catch (error) {
    if (error instanceof ErroConexao && /Mercado Pago 4\d\d/.test(error.message)) {
      throw new ErroConexao('O Mercado Pago não reconheceu esse Client ID e Client Secret. Confira e tente de novo.');
    }
    // Mercado Pago unreachable or failing: not the couple's typing, so not a 400.
    throw new Error((error as Error).message, { cause: error });
  }
  const anterior = await queryOne<{ client_id: string }>('SELECT client_id FROM mercadopago_aplicacao');
  await query(
    `INSERT INTO mercadopago_aplicacao (id, client_id, client_secret, salva_por) VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE
        SET client_id = EXCLUDED.client_id, client_secret = EXCLUDED.client_secret, salva_em = now(), salva_por = EXCLUDED.salva_por`,
    [clientId, cifrar(clientSecret), usuarioId],
  );
  if (anterior && anterior.client_id !== clientId) await desconectar();
}

// ---- OAuth ----

type Tokens = {
  access_token: string;
  refresh_token: string;
  public_key?: string;
  user_id: number;
  expires_in: number;
  live_mode: boolean;
};

const base64url = (b: Buffer) => b.toString('base64url');

// First step of "Conectar ao Mercado Pago": where to send the couple to authorize the application.
export async function iniciarConexao(usuarioId: number): Promise<string> {
  const aplicacao = await lerAplicacao();
  if (!aplicacao) throw new ErroConexao('Cadastre primeiro o Client ID e o Client Secret da aplicação do Mercado Pago.');
  const estado = base64url(randomBytes(24));
  const verificador = base64url(randomBytes(48));
  await query("DELETE FROM mercadopago_oauth WHERE criado_em < now() - interval '10 minutes'");
  await query('INSERT INTO mercadopago_oauth (estado, verificador, usuario_id) VALUES ($1, $2, $3)', [estado, verificador, usuarioId]);
  const url = new URL(AUTORIZACAO);
  url.search = new URLSearchParams({
    client_id: aplicacao.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state: estado,
    redirect_uri: urlDeRetorno(),
    code_challenge: base64url(createHash('sha256').update(verificador).digest()),
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

// Mercado Pago sent the couple back with an authorization code: trade it for the account's tokens.
// The state must be one this same panel user started in the last 10 minutes.
export async function concluirConexao(usuarioId: number, estado: string, codigo: string): Promise<void> {
  const pedido = await queryOne<{ verificador: string }>(
    `DELETE FROM mercadopago_oauth
      WHERE estado = $1 AND usuario_id = $2 AND criado_em > now() - interval '10 minutes'
      RETURNING verificador`,
    [estado, usuarioId],
  );
  if (!pedido) throw new ErroConexao('O pedido de conexão expirou ou não é deste usuário. Tente conectar de novo.');
  const aplicacao = await lerAplicacao();
  if (!aplicacao) throw new ErroConexao('A aplicação do Mercado Pago não está cadastrada.');
  const tokens = await pedirTokens(aplicacao, {
    grant_type: 'authorization_code',
    code: codigo,
    redirect_uri: urlDeRetorno(),
    code_verifier: pedido.verificador,
  });
  const perfil = await perfilDaConta(tokens.access_token);
  await query(
    `INSERT INTO mercadopago_conta (id, usuario_mp, apelido, email, access_token, refresh_token, producao, expira_em, conectada_por, public_key)
     VALUES (1, $1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7), $8, $9)
     ON CONFLICT (id) DO UPDATE
        SET usuario_mp = EXCLUDED.usuario_mp, apelido = EXCLUDED.apelido, email = EXCLUDED.email,
            access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
            producao = EXCLUDED.producao, expira_em = EXCLUDED.expira_em, public_key = EXCLUDED.public_key, origem = 'oauth',
            conectada_em = now(), conectada_por = EXCLUDED.conectada_por, renovada_em = NULL`,
    [
      tokens.user_id,
      perfil?.nickname ?? null,
      perfil?.email ?? null,
      cifrar(tokens.access_token),
      cifrar(tokens.refresh_token),
      tokens.live_mode,
      tokens.expires_in,
      usuarioId,
      tokens.public_key ?? null,
    ],
  );
}

async function perfilDaConta(accessToken: string): Promise<{ nickname?: string; email?: string } | null> {
  try {
    const resposta = await fetch(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    return resposta.ok ? ((await resposta.json()) as { nickname?: string; email?: string }) : null;
  } catch {
    return null; // only for display: the connection works without it
  }
}

// The other way in: the Public Key and Access Token of an application's credentials (test or
// production), pasted in the panel. No OAuth and no renewal. The token is checked with Mercado Pago
// first (it must open the account it belongs to), and the public key's shape is checked here.
export async function salvarCredenciais(publicKey: string, accessToken: string, producao: boolean, usuarioId: number): Promise<void> {
  let perfil: { id?: number; nickname?: string; email?: string } | null;
  try {
    const resposta = await fetch(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroConexao('O Mercado Pago não reconheceu esse Access Token. Confira e tente de novo.');
    }
    if (!resposta.ok) throw new Error(`Mercado Pago ${resposta.status} em /users/me`);
    perfil = (await resposta.json()) as { id?: number; nickname?: string; email?: string };
  } catch (error) {
    if (error instanceof ErroConexao) throw error;
    throw new Error((error as Error).message, { cause: error });
  }
  if (!perfil?.id) throw new ErroConexao('O Mercado Pago não devolveu a conta desse Access Token. Confira e tente de novo.');
  await query(
    `INSERT INTO mercadopago_conta (id, usuario_mp, apelido, email, access_token, refresh_token, producao, expira_em, conectada_por, public_key, origem)
     VALUES (1, $1, $2, $3, $4, NULL, $5, NULL, $6, $7, 'credenciais')
     ON CONFLICT (id) DO UPDATE
        SET usuario_mp = EXCLUDED.usuario_mp, apelido = EXCLUDED.apelido, email = EXCLUDED.email,
            access_token = EXCLUDED.access_token, refresh_token = NULL, producao = EXCLUDED.producao,
            expira_em = NULL, public_key = EXCLUDED.public_key, origem = 'credenciais',
            conectada_em = now(), conectada_por = EXCLUDED.conectada_por, renovada_em = NULL`,
    [perfil.id, perfil.nickname ?? null, perfil.email ?? null, cifrar(accessToken), producao, usuarioId, publicKey],
  );
}

// Forgets the account: the site stops taking payments until it is connected again. (Mercado Pago
// keeps the authorization listed in the account's "Aplicações conectadas", where it can be revoked.)
export async function desconectar(): Promise<void> {
  await query('DELETE FROM mercadopago_conta');
}

type ContaRow = {
  usuario_mp: string;
  apelido: string | null;
  email: string | null;
  access_token: string;
  refresh_token: string | null;
  producao: boolean;
  expira_em: Date | null;
  origem: 'oauth' | 'credenciais';
  conectada_em: Date;
  conectada_por_nome: string | null;
  public_key: string | null;
};

const lerConta = () =>
  queryOne<ContaRow>(
    `SELECT c.usuario_mp, c.apelido, c.email, c.access_token, c.refresh_token, c.producao, c.expira_em, c.conectada_em, c.origem,
            c.public_key, u.nome AS conectada_por_nome
       FROM mercadopago_conta c LEFT JOIN usuarios u ON u.id = c.conectada_por`,
  );

// What the panel shows in Configurações.
export async function situacao(): Promise<ContaMercadoPago> {
  const [aplicacao, conta] = await Promise.all([lerAplicacao(), lerConta()]);
  return {
    urlDeRetorno: urlDeRetorno(),
    aplicacao: aplicacao && { clientId: aplicacao.clientId },
    conta: conta && {
      usuarioId: conta.usuario_mp,
      apelido: conta.apelido,
      email: conta.email,
      producao: conta.producao,
      conectadaEm: conta.conectada_em.toISOString(),
      conectadaPor: conta.conectada_por_nome,
      expiraEm: conta.expira_em?.toISOString() ?? null,
      origem: conta.origem,
      // Connected before the in-site checkout: no public key, so it must be connected again.
      precisaReconectar: !conta.public_key,
    },
  };
}

// ---- Access token for the API calls ----

let renovando: Promise<string | null> | null = null;

// The connected account's access token, renewed when it is close to expiring (refresh tokens are
// single-use, so only one renewal runs at a time). Null when no account is connected (or its
// tokens can no longer be read or renewed: the panel then asks to connect again).
export async function tokenDeAcesso(): Promise<string | null> {
  const conta = await lerConta();
  if (!conta) return null;
  let atual: string;
  try {
    atual = decifrar(conta.access_token);
  } catch {
    console.warn('token do Mercado Pago ilegível (a senha do banco mudou?): conecte a conta de novo no painel');
    return null;
  }
  // Pasted credentials don't expire (and have nothing to renew them with).
  if (!conta.expira_em || !conta.refresh_token) return atual;
  const renovarEm = conta.expira_em.getTime() - RENOVAR_ANTES_DIAS * 86_400_000;
  if (Date.now() < renovarEm) return atual;
  renovando ??= renovar(conta).finally(() => {
    renovando = null;
  });
  const novo = await renovando;
  // Renewal failed but the current token still works: keep using it and try again next time.
  return novo ?? (Date.now() < conta.expira_em.getTime() ? atual : null);
}

async function renovar(conta: ContaRow): Promise<string | null> {
  try {
    const aplicacao = await lerAplicacao();
    if (!aplicacao) return null;
    if (!conta.refresh_token) return null;
    const tokens = await pedirTokens(aplicacao, { grant_type: 'refresh_token', refresh_token: decifrar(conta.refresh_token) });
    await query(
      `UPDATE mercadopago_conta
          SET access_token = $1, refresh_token = $2, expira_em = now() + make_interval(secs => $3), renovada_em = now(),
              public_key = coalesce($5, public_key)
        WHERE usuario_mp = $4`,
      [cifrar(tokens.access_token), cifrar(tokens.refresh_token), tokens.expires_in, conta.usuario_mp, tokens.public_key ?? null],
    );
    console.info('token do Mercado Pago renovado');
    return tokens.access_token;
  } catch (error) {
    console.warn('não foi possível renovar o token do Mercado Pago:', (error as Error).message);
    return null;
  }
}

// What the guest's browser needs to show the payment form: the connected account's public key
// (public by design: it only lets the Brick tokenize cards for this account). Null while payments
// are unavailable (no account, or one connected before the in-site checkout).
export async function chavePublica(): Promise<string | null> {
  const conta = await lerConta();
  return conta?.public_key ?? null;
}
