import { api, ApiError } from '@nv/shared/api';

export const SESSION_EXPIRED_EVENT = 'nv:sessao-expirada';

// Same as `api`, but a 401 sends the couple back to the login screen.
export async function adminApi<T>(...args: Parameters<typeof api>): Promise<T> {
  try {
    return await api<T>(...args);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw error;
  }
}

export const inviteLink = (codigo: string) => `${location.origin}/#convite=${codigo}`;

export function whatsappLink(nome: string, codigo: string) {
  const texto = `Olá, ${nome}! Com muito carinho, convidamos você para o nosso casamento. Confirme sua presença por aqui: ${inviteLink(codigo)}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Uploads a gift photo (multipart) and returns its URL. The API re-encodes it.
// tipo 'galeria' keeps a larger image (gallery photos open full screen).
export async function enviarFoto(arquivo: File, tipo: 'presente' | 'galeria' = 'presente'): Promise<string> {
  const form = new FormData();
  form.append('foto', arquivo);
  let res: Response;
  try {
    res = await fetch(`/api/admin/uploads?tipo=${tipo}`, { method: 'POST', body: form, credentials: 'same-origin' });
  } catch {
    throw new Error('Sem conexão com o servidor. Tente novamente.');
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  if (!res.ok) throw new Error(data?.erro ?? 'Não foi possível enviar a foto.');
  return data.url as string;
}
