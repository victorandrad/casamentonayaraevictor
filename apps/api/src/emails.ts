// Mailboxes and aliases of this domain on the couple's mail server (docker-mailserver), managed in
// the panel. The server lives in another Docker project and serves several domains: the API sees
// and changes only the lines of this domain and keeps the others exactly as they are. The server
// reads two files from its config folder (mounted in the API) and reloads them by itself a few
// seconds after they change:
//   postfix-accounts.cf  →  endereco|{SHA512-CRYPT}$6$...     (one mailbox per line)
//   postfix-virtual.cf   →  apelido destino1,destino2         (aliases / forwards)
import { access, constants, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encrypt, verify } from 'unixcrypt';
import type { ApelidoEmail, CaixaEmail, EmailsAdmin } from '@nv/shared/types';
import { config } from './config.ts';

export class ErroEmail extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const CONTAS = 'postfix-accounts.cf';
const APELIDOS = 'postfix-virtual.cf';
const USUARIO = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const EMAIL = /^[^\s@,|]+@[^\s@,|]+\.[^\s@,|]+$/;
export const SENHA_MINIMA = 10;

const { configDir, domain } = config.mail;
const doDominio = (endereco: string) => Boolean(domain) && endereco.endsWith(`@${domain}`);

async function disponivel(): Promise<boolean> {
  if (!configDir || !domain) return false;
  try {
    await access(configDir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function exigirDisponivel() {
  if (!(await disponivel())) throw new ErroEmail('O servidor de e-mail não está configurado neste ambiente.', 503);
}

async function lerArquivo(arquivo: string): Promise<string[]> {
  try {
    return (await readFile(join(configDir, arquivo), 'utf8')).split('\n');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

const lerLinhas = async (arquivo: string) => (await lerArquivo(arquivo)).filter((l) => l.trim() && !l.startsWith('#'));

// Atomic write (temp file + rename) so the mail server never reads half a file. Comments already in
// the file (the file is shared with the other domains) stay at the top.
async function gravarLinhas(arquivo: string, linhas: string[]) {
  const destino = join(configDir, arquivo);
  const temp = `${destino}.${process.pid}.tmp`;
  const comentarios = (await lerArquivo(arquivo)).filter((l) => l.startsWith('#'));
  const todas = [...comentarios, ...linhas];
  await writeFile(temp, todas.length ? `${todas.join('\n')}\n` : '', { mode: 0o600 });
  await rename(temp, destino);
}

// One change at a time (read, change, write).
let fila: Promise<unknown> = Promise.resolve();
function emOrdem<T>(fn: () => Promise<T>): Promise<T> {
  const proxima = fila.then(fn, fn);
  fila = proxima.catch(() => {});
  return proxima;
}

const lerContas = async () =>
  (await lerLinhas(CONTAS)).map((l) => {
    const [endereco, hash = ''] = l.split('|');
    return { endereco: endereco.trim().toLowerCase(), linha: l, hash };
  });

// `linha` keeps the original text: lines of other domains are written back untouched.
const lerApelidos = async (): Promise<(ApelidoEmail & { linha: string })[]> =>
  (await lerLinhas(APELIDOS)).map((l) => {
    const [endereco, destinos = ''] = l.trim().split(/\s+/, 2);
    return { endereco: endereco.toLowerCase(), destinos: destinos.split(',').map((d) => d.trim()).filter(Boolean), linha: l };
  });
const linhaDoApelido = (a: ApelidoEmail) => `${a.endereco} ${a.destinos.join(',')}`;

// "contato" or "contato@dominio" → "contato@dominio" (only this domain).
function enderecoDoDominio(usuario: string): string {
  const valor = usuario.trim().toLowerCase();
  const local = valor.endsWith(`@${domain}`) ? valor.slice(0, -(domain.length + 1)) : valor;
  if (!USUARIO.test(local)) {
    throw new ErroEmail('Use só letras minúsculas, números, ponto, hífen ou sublinhado antes do @ (ex.: contato).');
  }
  return `${local}@${domain}`;
}

function validarSenha(senha: string) {
  if (senha.length < SENHA_MINIMA) throw new ErroEmail(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  if (/[\s|]/.test(senha)) throw new ErroEmail('A senha não pode ter espaços nem o caractere |.');
}

function validarDestinos(destinos: string[]): string[] {
  const limpos = [...new Set(destinos.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  if (!limpos.length) throw new ErroEmail('Informe pelo menos um destino.');
  const invalido = limpos.find((d) => !EMAIL.test(d));
  if (invalido) throw new ErroEmail(`Endereço inválido: ${invalido}`);
  return limpos;
}

const hashDaSenha = (senha: string) => `{SHA512-CRYPT}${encrypt(senha)}`;
const PREFIXO_HASH = '{SHA512-CRYPT}';

// The panel login's mailbox (same address as ADMIN_EMAIL), when it belongs to this domain.
export function caixaDoPainel(): string | null {
  const email = config.mail.adminEmail;
  return domain && email.endsWith(`@${domain}`) ? email : null;
}

function protegerCaixaDoPainel(endereco: string) {
  if (endereco === caixaDoPainel()) {
    throw new ErroEmail(
      'A senha desta caixa é a mesma do login do painel: troque em "Minha conta".',
      409,
    );
  }
}

export async function listar(): Promise<EmailsAdmin> {
  const pronto = await disponivel();
  const caixas: CaixaEmail[] = pronto
    ? (await lerContas()).filter((c) => doDominio(c.endereco)).map(({ endereco }) => ({ endereco }))
    : [];
  const apelidos: ApelidoEmail[] = pronto
    ? (await lerApelidos()).filter((a) => doDominio(a.endereco)).map(({ endereco, destinos }) => ({ endereco, destinos }))
    : [];
  const { hostname } = config.mail;
  return {
    disponivel: pronto,
    dominio: domain,
    caixas: caixas.sort((a, b) => a.endereco.localeCompare(b.endereco)),
    apelidos: apelidos.sort((a, b) => a.endereco.localeCompare(b.endereco)),
    caixaDoPainel: caixaDoPainel(),
    servidor: {
      imap: hostname,
      smtp: hostname,
      webmail: config.mail.webmailUrl || (hostname ? `https://${hostname}` : ''),
    },
  };
}

export function criarCaixa(usuario: string, senha: string): Promise<CaixaEmail> {
  return emOrdem(async () => {
    await exigirDisponivel();
    const endereco = enderecoDoDominio(usuario);
    validarSenha(senha);
    const contas = await lerContas();
    if (contas.some((c) => c.endereco === endereco)) throw new ErroEmail('Já existe uma caixa com esse endereço.', 409);
    if ((await lerApelidos()).some((a) => a.endereco === endereco)) {
      throw new ErroEmail('Esse endereço já é um apelido. Exclua o apelido antes de criar a caixa.', 409);
    }
    await gravarLinhas(CONTAS, [...contas.map((c) => c.linha), `${endereco}|${hashDaSenha(senha)}`]);
    return { endereco };
  });
}

export function trocarSenha(endereco: string, senha: string): Promise<void> {
  return emOrdem(async () => {
    await exigirDisponivel();
    validarSenha(senha);
    const contas = await lerContas();
    const alvo = endereco.trim().toLowerCase();
    if (!doDominio(alvo) || !contas.some((c) => c.endereco === alvo)) throw new ErroEmail('Caixa não encontrada.', 404);
    protegerCaixaDoPainel(alvo);
    await gravarLinhas(
      CONTAS,
      contas.map((c) => (c.endereco === alvo ? `${c.endereco}|${hashDaSenha(senha)}` : c.linha)),
    );
  });
}

// The messages already received stay in the server's storage (they are not deleted here).
export function excluirCaixa(endereco: string): Promise<void> {
  return emOrdem(async () => {
    await exigirDisponivel();
    const contas = await lerContas();
    const alvo = endereco.trim().toLowerCase();
    if (!doDominio(alvo) || !contas.some((c) => c.endereco === alvo)) throw new ErroEmail('Caixa não encontrada.', 404);
    protegerCaixaDoPainel(alvo);
    await gravarLinhas(CONTAS, contas.filter((c) => c.endereco !== alvo).map((c) => c.linha));
  });
}

export function salvarApelido(usuario: string, destinos: string[], novo: boolean): Promise<ApelidoEmail> {
  return emOrdem(async () => {
    await exigirDisponivel();
    const endereco = enderecoDoDominio(usuario);
    const limpos = validarDestinos(destinos);
    if (limpos.includes(endereco)) throw new ErroEmail('O apelido não pode entregar para ele mesmo.');
    const apelidos = await lerApelidos();
    const existe = apelidos.some((a) => a.endereco === endereco);
    if (novo && existe) throw new ErroEmail('Já existe um apelido com esse endereço.', 409);
    if (!novo && !existe) throw new ErroEmail('Apelido não encontrado.', 404);
    if (novo && (await lerContas()).some((c) => c.endereco === endereco)) {
      throw new ErroEmail('Esse endereço já é uma caixa de e-mail.', 409);
    }
    const linha = linhaDoApelido({ endereco, destinos: limpos });
    const linhas = existe
      ? apelidos.map((a) => (a.endereco === endereco ? linha : a.linha))
      : [...apelidos.map((a) => a.linha), linha];
    await gravarLinhas(APELIDOS, linhas);
    return { endereco, destinos: limpos };
  });
}

export function excluirApelido(endereco: string): Promise<void> {
  return emOrdem(async () => {
    await exigirDisponivel();
    const apelidos = await lerApelidos();
    const alvo = endereco.trim().toLowerCase();
    if (!doDominio(alvo) || !apelidos.some((a) => a.endereco === alvo)) throw new ErroEmail('Apelido não encontrado.', 404);
    await gravarLinhas(APELIDOS, apelidos.filter((a) => a.endereco !== alvo).map((a) => a.linha));
  });
}

// Called by the seed on every backend deploy: the panel login's mailbox gets (or keeps) the panel
// password. Nothing is written when the stored hash already matches.
export function sincronizarCaixaDoPainel(senha: string): Promise<'criada' | 'atualizada' | 'igual' | 'ignorada'> {
  return emOrdem(async () => {
    const endereco = caixaDoPainel();
    if (!endereco || !senha || !(await disponivel())) return 'ignorada';
    if ((await lerApelidos()).some((a) => a.endereco === endereco)) return 'ignorada';
    const contas = await lerContas();
    const atual = contas.find((c) => c.endereco === endereco);
    if (atual && atual.hash.startsWith(PREFIXO_HASH) && verify(senha, atual.hash.slice(PREFIXO_HASH.length))) return 'igual';
    const linha = `${endereco}|${hashDaSenha(senha)}`;
    await gravarLinhas(CONTAS, atual ? contas.map((c) => (c.endereco === endereco ? linha : c.linha)) : [...contas.map((c) => c.linha), linha]);
    return atual ? 'atualizada' : 'criada';
  });
}

// Panel password change: a mailbox with the user's address (if there is one) keeps the same password.
export function atualizarSenhaDaCaixa(endereco: string, senha: string): Promise<boolean> {
  return emOrdem(async () => {
    if (!(await disponivel())) return false;
    const alvo = endereco.trim().toLowerCase();
    if (!doDominio(alvo)) return false;
    const contas = await lerContas();
    if (!contas.some((c) => c.endereco === alvo)) return false;
    await gravarLinhas(CONTAS, contas.map((c) => (c.endereco === alvo ? `${alvo}|${hashDaSenha(senha)}` : c.linha)));
    return true;
  });
}
