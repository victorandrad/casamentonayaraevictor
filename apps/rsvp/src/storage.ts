// Invites, RSVP answers and door check-in, backed by the wedding API.
import { api } from '@nv/shared/api';
import type { Checkin, ConvitePublico, RespostaInput } from '@nv/shared/types';

export const buscarConvite = (codigo: string) =>
  api<ConvitePublico>(`/public/convites/${encodeURIComponent(codigo.trim())}`);

export const responderConvite = (codigo: string, resposta: RespostaInput) =>
  api<ConvitePublico>(`/public/convites/${encodeURIComponent(codigo)}/resposta`, { method: 'PUT', body: resposta });

export const consultarCheckin = (codigo: string) =>
  api<Checkin>(`/public/checkin/${encodeURIComponent(codigo.trim())}`);

// Accepts a raw code or a URL containing #checkin=CODE / #convite=CODE.
export function parseCode(text: string): string {
  const m = text.match(/(?:checkin|convite)=([A-Za-z0-9-]+)/i);
  return (m ? m[1] : text).trim();
}

export function hashParam(name: 'convite' | 'checkin'): string | null {
  return location.hash.match(new RegExp(`${name}=([A-Za-z0-9-]+)`))?.[1] ?? null;
}

export function checkinUrl(code: string) {
  return `${location.origin}${location.pathname}#checkin=${code}`;
}
