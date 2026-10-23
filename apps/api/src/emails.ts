// Mailboxes and aliases of the couple's own mail server (docker-mailserver), managed in the panel.
// The server reads two files from its config folder (shared with the API as a volume) and reloads
// them by itself a few seconds after they change:
//   postfix-accounts.cf  →  endereco|{SHA512-CRYPT}$6$...     (one mailbox per line)
//   postfix-virtual.cf   →  apelido destino1,destino2         (aliases / forwards)
import { access, constants, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encrypt } from 'unixcrypt';
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

async function lerLinhas(arquivo: string): Promise<string[]> {
  try {
    return (await readFile(join(configDir, arquivo), 'utf8')).split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

// Atomic write (temp file + rename) so the mail server never reads half a file.
async function gravarLinhas(arquivo: string, linhas: string[]) {
  const destino = join(configDir, arquivo);
  const temp = `${destino}.${process.pid}.tmp`;
  await writeFile(temp, linhas.length ? `${linhas.join('\n')}\n` : '', { mode: 0o600 });
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

const lerApelidos = async (): Promise<ApelidoEmail[]> =>
  (await lerLinhas(APELIDOS)).map((l) => {
    const [endereco, destinos = ''] = l.trim().split(/\s+/, 2);
    return { endereco: endereco.toLowerCase(), destinos: destinos.split(',').map((d) => d.trim()).filter(Boolean) };
  });

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

export async function listar(): Promise<EmailsAdmin> {
  const pronto = await disponivel();
  const caixas: CaixaEmail[] = pronto ? (await lerContas()).map(({ endereco }) => ({ endereco })) : [];
  return {
    disponivel: pronto,
    dominio: domain,
    caixas: caixas.sort((a, b) => a.endereco.localeCompare(b.endereco)),
    apelidos: pronto ? (await lerApelidos()).sort((a, b) => a.endereco.localeCompare(b.endereco)) : [],
    servidor: {
      imap: domain ? `mail.${domain}` : '',
      smtp: domain ? `mail.${domain}` : '',
      webmail: config.mail.webmailUrl || (domain ? `https://mail.${domain}` : ''),
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
    if (!contas.some((c) => c.endereco === alvo)) throw new ErroEmail('Caixa não encontrada.', 404);
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
    if (!contas.some((c) => c.endereco === alvo)) throw new ErroEmail('Caixa não encontrada.', 404);
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
    const lista = existe
      ? apelidos.map((a) => (a.endereco === endereco ? { endereco, destinos: limpos } : a))
      : [...apelidos, { endereco, destinos: limpos }];
    await gravarLinhas(APELIDOS, lista.map((a) => `${a.endereco} ${a.destinos.join(',')}`));
    return { endereco, destinos: limpos };
  });
}

export function excluirApelido(endereco: string): Promise<void> {
  return emOrdem(async () => {
    await exigirDisponivel();
    const apelidos = await lerApelidos();
    const alvo = endereco.trim().toLowerCase();
    if (!apelidos.some((a) => a.endereco === alvo)) throw new ErroEmail('Apelido não encontrado.', 404);
    await gravarLinhas(
      APELIDOS,
      apelidos.filter((a) => a.endereco !== alvo).map((a) => `${a.endereco} ${a.destinos.join(',')}`),
    );
  });
}
