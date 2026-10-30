import { api } from '@nv/shared/api';

// Browser notices about an open order (the Pix about to expire, the payment's outcome): asked for by
// the guest on the order's page. The API keeps the subscription only while the order is open.

// iPhone only has them for the site added to the home screen; elsewhere the button just doesn't show.
export const avisosSuportados = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const avisosBloqueados = () => avisosSuportados() && Notification.permission === 'denied';

// Orders this browser already asked notices for (so the page says so after a reload).
const CHAVE = 'nv_avisos_pedidos';
function lembrados(): string[] {
  try {
    const salvo: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
    return Array.isArray(salvo) ? salvo.filter((u): u is string => typeof u === 'string').slice(-10) : [];
  } catch {
    return [];
  }
}
export const avisosAtivos = (uid: string) => avisosSuportados() && Notification.permission === 'granted' && lembrados().includes(uid);

function base64ParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const texto = atob(base64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
  return bytes;
}

// Asks the browser's permission (must follow the guest's click), subscribes and tells the API.
// Resolves false when the guest said no.
export async function ativarAvisos(uid: string): Promise<boolean> {
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const registro = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { chave } = await api<{ chave: string }>('/public/push/chave');
  let inscricao = await registro.pushManager.getSubscription();
  // A subscription made with other keys (they were renewed on the server) can't be used.
  const atual = inscricao?.options.applicationServerKey;
  if (inscricao && atual && btoa(String.fromCharCode(...new Uint8Array(atual))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== chave) {
    await inscricao.unsubscribe();
    inscricao = null;
  }
  inscricao ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chave) });
  const { endpoint, keys } = inscricao.toJSON();
  await api(`/public/pedidos/${uid}/push`, { method: 'POST', body: { endpoint, keys } });
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...lembrados().filter((u) => u !== uid), uid]));
  } catch {
    // storage blocked: the notices still come, the page just won't remember asking
  }
  return true;
}
