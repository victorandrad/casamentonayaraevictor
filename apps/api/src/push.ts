// Notices in the guest's browser (Web Push) while a payment is open: the guest asks for them on the
// order's page, and gets one when the Pix is about to expire and one when the payment is confirmed
// or doesn't go through. A subscription belongs to one order and is deleted once that order ends.
import webpush, { WebPushError, type PushSubscription } from 'web-push';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';
import { cifrar, decifrar } from './mercadopagoConta.ts';

export class InscricaoInvalida extends Error {}

const MAX_POR_PEDIDO = 5;
// The reminder goes out when this much time is left on the Pix (it lasts 30 minutes).
const LEMBRETE_MINUTOS = 10;

// The server posts to the address the browser gives, so only the browsers' own push services are
// accepted (otherwise anyone could make the server call any address).
const SERVICOS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export function validarInscricao(sub: PushSubscription): void {
  let url: URL;
  try {
    url = new URL(sub.endpoint);
  } catch {
    throw new InscricaoInvalida();
  }
  const conhecido = SERVICOS.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
  if (url.protocol !== 'https:' || !conhecido || url.port) throw new InscricaoInvalida();
}

// ---- VAPID keys: made on first use, kept in the database (the private one encrypted) ----

type Chaves = { publica: string; privada: string };
let chaves: Promise<Chaves> | null = null;

async function lerOuCriarChaves(): Promise<Chaves> {
  const ler = () => queryOne<{ publica: string; privada: string }>('SELECT publica, privada FROM push_chaves');
  let linha = await ler();
  if (linha) {
    try {
      return { publica: linha.publica, privada: decifrar(linha.privada) };
    } catch {
      // The database password changed: new keys, and the old subscriptions can't be used with them.
      console.warn('chave privada dos avisos ilegível (a senha do banco mudou?): criando novas');
      await query('DELETE FROM push_chaves');
      await query('DELETE FROM push_inscricoes');
    }
  }
  const novas = webpush.generateVAPIDKeys();
  await query('INSERT INTO push_chaves (publica, privada) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [novas.publicKey, cifrar(novas.privateKey)]);
  linha = (await ler())!;
  return { publica: linha.publica, privada: decifrar(linha.privada) };
}

function chavesVapid(): Promise<Chaves> {
  chaves ??= lerOuCriarChaves().catch((error) => {
    chaves = null;
    throw error;
  });
  return chaves;
}

export const chavePublicaPush = async () => (await chavesVapid()).publica;

// ---- Subscribing ----

// Returns false when the order is no longer open (nothing left to tell about it).
export async function inscrever(pedidoUid: string, sub: PushSubscription): Promise<boolean> {
  validarInscricao(sub);
  const pedido = await queryOne<{ id: number; aberto: boolean; n: string }>(
    `SELECT p.id, p.status IN ('aguardando', 'pendente') AS aberto,
            (SELECT count(*) FROM push_inscricoes i WHERE i.pedido_id = p.id) AS n
       FROM pedidos p WHERE p.uid = $1`,
    [pedidoUid],
  );
  if (!pedido?.aberto) return false;
  if (Number(pedido.n) >= MAX_POR_PEDIDO) throw new InscricaoInvalida();
  await query(
    `INSERT INTO push_inscricoes (pedido_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (pedido_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    [pedido.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  );
  return true;
}

// ---- Sending ----

type Aviso = { titulo: string; corpo: string; url: string; tag: string };
type Linha = { id: number; endpoint: string; p256dh: string; auth: string; uid: string; status: string; nome: string; minutos: number | null; lembrar: boolean };

function avisoFinal(l: Linha): Aviso | null {
  const primeiro = l.nome.trim().split(/\s+/)[0] ?? '';
  const tag = `pedido-${l.uid}`;
  if (l.status === 'pago') {
    return {
      titulo: 'Pagamento confirmado 🎉',
      corpo: `Obrigado${primeiro ? `, ${primeiro}` : ''}! Seu presente chegou para os noivos. Que tal deixar um recado no mural?`,
      url: `/presentear/pedido/${l.uid}`,
      tag,
    };
  }
  if (l.status === 'expirado' || l.status === 'falhou' || l.status === 'estornado') {
    return {
      titulo: l.status === 'expirado' ? 'O Pix venceu' : 'Pagamento não concluído',
      corpo: 'Nada foi cobrado e o presente voltou para a lista. Se ainda quiser presentear, é só escolher de novo.',
      url: '/#presentes',
      tag,
    };
  }
  return null;
}

async function enviar(l: Linha, aviso: Aviso, validadeSegundos: number) {
  const { publica, privada } = await chavesVapid();
  try {
    await webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, JSON.stringify(aviso), {
      TTL: validadeSegundos,
      urgency: 'high',
      vapidDetails: { subject: config.siteUrl.startsWith('https:') ? config.siteUrl : 'mailto:nao-responder@localhost', publicKey: publica, privateKey: privada },
    });
  } catch (error) {
    // 404/410: the guest turned notices off or the browser dropped the subscription.
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      await query('DELETE FROM push_inscricoes WHERE id = $1', [l.id]);
      return;
    }
    console.warn(`aviso do pedido ${l.uid} não enviado:`, (error as Error).message);
  }
}

// Sends what is due: the reminder of a Pix about to expire, and the outcome of finished orders
// (whose subscriptions then go). Runs every minute from server.ts and right after a payment changes.
// Each notice is claimed in the database first, so two runs at once never send it twice.
let rodando = false;
export async function enviarAvisos(): Promise<void> {
  if (rodando) return;
  rodando = true;
  try {
    const linhas = await query<Linha>(
      `SELECT i.id, i.endpoint, i.p256dh, i.auth, p.uid, p.status, p.nome,
              ceil(extract(epoch FROM p.pix_expira_em - now()) / 60)::int AS minutos,
              (p.status = 'aguardando' AND i.lembrete_enviado_em IS NULL
                AND p.pix_expira_em BETWEEN now() AND now() + make_interval(mins => $1)) AS lembrar
         FROM push_inscricoes i JOIN pedidos p ON p.id = i.pedido_id
        WHERE p.status NOT IN ('aguardando', 'pendente')
           OR p.criado_em < now() - interval '2 days'
           OR (p.status = 'aguardando' AND i.lembrete_enviado_em IS NULL
               AND p.pix_expira_em BETWEEN now() AND now() + make_interval(mins => $1))
        LIMIT 200`,
      [LEMBRETE_MINUTOS],
    );
    for (const l of linhas) {
      if (l.lembrar) {
        const meu = await queryOne('UPDATE push_inscricoes SET lembrete_enviado_em = now() WHERE id = $1 AND lembrete_enviado_em IS NULL RETURNING id', [l.id]);
        if (!meu) continue;
        const minutos = Math.max(1, l.minutos ?? 1);
        await enviar(
          l,
          {
            titulo: 'Seu Pix está quase vencendo',
            corpo: `Faltam ${minutos} minuto${minutos > 1 ? 's' : ''} para pagar o Pix do seu presente. Depois disso ele volta para a lista.`,
            url: `/presentear/pedido/${l.uid}`,
            tag: `pedido-${l.uid}`,
          },
          minutos * 60,
        );
        continue;
      }
      // Finished (or a very old one still open, which just goes away quietly).
      const meu = await queryOne('DELETE FROM push_inscricoes WHERE id = $1 RETURNING id', [l.id]);
      const aviso = avisoFinal(l);
      if (meu && aviso) await enviar(l, aviso, 24 * 60 * 60);
    }
  } finally {
    rodando = false;
  }
}
