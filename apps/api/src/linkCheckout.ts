// The gift checkout's address carries the cart (/presentear?c=<link>), so the page survives a reload,
// opens on another device and can be sent to someone. The link is the chosen gifts and amounts,
// encrypted and signed by the server (AES-256-GCM): it can't be read, edited or forged in the
// browser. Prices are not in it (they always come from the API) and nothing about the guest is:
// addresses end up in history, logs and shared screenshots, so name, e-mail and CPF stay out.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { config } from './config.ts';

export const MAX_ITENS_LINK = 50;
const MAX_QUANTIDADE = 10;
// Same life as the cart kept in the browser.
export const VALIDADE_LINK_MS = 24 * 60 * 60_000;
const VERSAO = 1;
const CONTEXTO = Buffer.from('nv-checkout-v1');

export type ItemLink = { presenteId: string; quantidade: number };
export class LinkInvalido extends Error {}
export class LinkExpirado extends Error {}

// Its own key, derived from the database password like the stored secrets but with another label,
// so links and secrets never share a key. Changing that password only invalidates open links.
let chaveEmCache: Buffer | null = null;
const chave = () => {
  if (!chaveEmCache) {
    const url = new URL(config.databaseUrl);
    chaveEmCache = Buffer.from(hkdfSync('sha256', decodeURIComponent(url.password) || config.databaseUrl, 'nv-checkout', 'link', 32));
  }
  return chaveEmCache;
};

const uuidParaBytes = (uuid: string) => Buffer.from(uuid.replace(/-/g, ''), 'hex');
const bytesParaUuid = (b: Buffer) => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

// Compact on purpose (an address, not a document): version, expiry in seconds, then 16 bytes of
// gift id plus 1 byte of quantity per item. Three gifts make a ~110-character link.
export function criarLink(itens: ItemLink[], agora = Date.now()): { link: string; expiraEm: string } {
  const expira = Math.floor((agora + VALIDADE_LINK_MS) / 1000);
  const cabecalho = Buffer.alloc(5);
  cabecalho.writeUInt8(VERSAO, 0);
  cabecalho.writeUInt32BE(expira, 1);
  const corpo = Buffer.concat([cabecalho, ...itens.map((i) => Buffer.concat([uuidParaBytes(i.presenteId), Buffer.from([i.quantidade])]))]);

  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave(), iv);
  cifra.setAAD(CONTEXTO);
  const dados = Buffer.concat([cifra.update(corpo), cifra.final()]);
  return {
    link: Buffer.concat([iv, cifra.getAuthTag(), dados]).toString('base64url'),
    expiraEm: new Date(expira * 1000).toISOString(),
  };
}

export function abrirLink(link: string, agora = Date.now()): { itens: ItemLink[]; expiraEm: string } {
  const bruto = Buffer.from(link, 'base64url');
  if (bruto.length < 12 + 16 + 5) throw new LinkInvalido();
  let corpo: Buffer;
  try {
    const decifra = createDecipheriv('aes-256-gcm', chave(), bruto.subarray(0, 12));
    decifra.setAAD(CONTEXTO);
    decifra.setAuthTag(bruto.subarray(12, 28));
    corpo = Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]);
  } catch {
    throw new LinkInvalido();
  }
  if (corpo.readUInt8(0) !== VERSAO || (corpo.length - 5) % 17 !== 0) throw new LinkInvalido();
  const expira = corpo.readUInt32BE(1) * 1000;
  if (expira < agora) throw new LinkExpirado();

  const itens: ItemLink[] = [];
  for (let p = 5; p < corpo.length; p += 17) {
    const quantidade = corpo.readUInt8(p + 16);
    if (quantidade < 1 || quantidade > MAX_QUANTIDADE) throw new LinkInvalido();
    itens.push({ presenteId: bytesParaUuid(corpo.subarray(p, p + 16)), quantidade });
  }
  return { itens, expiraEm: new Date(expira).toISOString() };
}
