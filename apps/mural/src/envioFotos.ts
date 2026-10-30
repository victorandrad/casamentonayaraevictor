// Guests' photos and videos (page /fotos): the feed, and sending a file in parts so a phone on the
// party's network can lose the connection and carry on from where it stopped.
import { api, ApiError } from '@nv/shared/api';
import type { EnvioMidia, FotosConvidados, MidiaEnviada } from '@nv/shared/types';

export const MAX_VIDEO_SEGUNDOS = 60;
const MAX_FOTO_MB = 40;
const MAX_VIDEO_MB = 400;

export const carregarFotosConvidados = (depois?: string | null) =>
  api<FotosConvidados>(`/public/fotos-convidados${depois ? `?depois=${depois}` : ''}`);

// ---- What this phone remembers (only here, never sent anywhere but to this site) ----
// A random token that proves "I sent this one" (to delete it), the name typed last time and what
// was sent from here.

const CHAVE_AUTOR = 'nv_fotos_autor';
const CHAVE_NOME = 'nv_fotos_nome';
const CHAVE_MINHAS = 'nv_fotos_minhas';

let autorEmMemoria: string | null = null;

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // storage blocked: works for this visit only
  }
}

export function tokenAutor(): string {
  const salvo = ler(CHAVE_AUTOR) ?? autorEmMemoria;
  if (salvo && /^[A-Za-z0-9_-]{32,64}$/.test(salvo)) return salvo;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const novo = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  autorEmMemoria = novo;
  gravar(CHAVE_AUTOR, novo);
  return novo;
}

export const nomeSalvo = () => ler(CHAVE_NOME) ?? '';
export const salvarNome = (nome: string) => gravar(CHAVE_NOME, nome.trim());

export function minhas(): Set<string> {
  try {
    return new Set(JSON.parse(ler(CHAVE_MINHAS) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function lembrarMinhas(uids: Set<string>) {
  gravar(CHAVE_MINHAS, JSON.stringify([...uids].slice(-500)));
}

export async function excluirMinha(uid: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/public/fotos-convidados/${uid}`, { method: 'DELETE', headers: { 'x-autor': tokenAutor() }, credentials: 'same-origin' });
  } catch {
    throw new Error('Sem conexão com o servidor. Tente novamente.');
  }
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.erro ?? 'Não foi possível excluir.');
  }
  const lista = minhas();
  lista.delete(uid);
  lembrarMinhas(lista);
}

// ---- Before sending ----

export function tipoDoArquivo(arquivo: File): 'foto' | 'video' | null {
  if (arquivo.type.startsWith('image/')) return 'foto';
  if (arquivo.type.startsWith('video/')) return 'video';
  if (/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(arquivo.name)) return 'foto';
  if (/\.(mp4|mov|m4v|webm|3gp)$/i.test(arquivo.name)) return 'video';
  return null;
}

// Photos straight from the camera are big: shrink to what the site keeps (2560 px) before sending,
// which makes the upload several times faster on the party's network. If the browser can't read it
// (e.g. HEIC outside Safari), the original goes and the server deals with it.
async function prepararFoto(arquivo: File): Promise<Blob> {
  if (arquivo.size <= 2.5 * 1024 * 1024) return arquivo;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement('canvas'), {
      width: Math.round(bitmap.width * escala),
      height: Math.round(bitmap.height * escala),
    });
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob && blob.size < arquivo.size ? blob : arquivo;
  } catch {
    return arquivo;
  }
}

// Length of a video, when the browser can tell (null when it can't play that format).
function duracaoDoVideo(arquivo: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(arquivo);
    const fim = (valor: number | null) => {
      URL.revokeObjectURL(url);
      resolve(valor);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => fim(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => fim(null);
    setTimeout(() => fim(null), 8000);
    video.src = url;
  });
}

// ---- Sending ----

class ErroParte extends Error {
  status: number;
  recebido?: number;
  constructor(status: number, mensagem: string, recebido?: number) {
    super(mensagem);
    this.status = status;
    this.recebido = recebido;
  }
}

// XMLHttpRequest because fetch can't tell how much of the body went out (the progress bar).
function enviarParte(envio: string, inicio: number, parte: Blob, aoProgredir: (bytes: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/public/fotos-convidados/envios/${envio}?inicio=${inicio}`);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => aoProgredir(e.loaded);
    xhr.onload = () => {
      let data: { recebido?: number; erro?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // not JSON (a proxy error page)
      }
      if (xhr.status === 200 && typeof data?.recebido === 'number') resolve(data.recebido);
      else reject(new ErroParte(xhr.status, data?.erro ?? 'Não foi possível enviar.', data?.recebido));
    };
    xhr.onerror = xhr.ontimeout = () => reject(new ErroParte(0, 'A conexão caiu.'));
    xhr.send(parte);
  });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Worth trying again: no connection, or the server/proxy briefly unavailable.
const passageiro = (status: number) => status === 0 || status === 502 || status === 503 || status === 504;

async function comTentativas<T>(fn: () => Promise<T>, vezes = 4): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await fn();
    } catch (error) {
      const status = error instanceof ApiError || error instanceof ErroParte ? error.status : 0;
      if (tentativa >= vezes || !passageiro(status)) throw error;
      await esperar(1000 * 2 ** tentativa);
    }
  }
}

export async function enviarArquivo(arquivo: File, nome: string, aoProgredir: (fracao: number) => void): Promise<MidiaEnviada> {
  const tipo = tipoDoArquivo(arquivo);
  if (!tipo) throw new Error('Esse arquivo não é foto nem vídeo.');
  if (tipo === 'video') {
    if (arquivo.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`O vídeo passa de ${MAX_VIDEO_MB} MB. Envie um trecho mais curto.`);
    const duracao = await duracaoDoVideo(arquivo);
    if (duracao !== null && duracao > MAX_VIDEO_SEGUNDOS + 1) throw new Error('O vídeo passa de 1 minuto. Envie um trecho mais curto.');
  }
  const corpo = tipo === 'foto' ? await prepararFoto(arquivo) : arquivo;
  if (tipo === 'foto' && corpo.size > MAX_FOTO_MB * 1024 * 1024) throw new Error(`A foto passa de ${MAX_FOTO_MB} MB.`);

  const { envio, parte } = await comTentativas(() =>
    api<EnvioMidia>('/public/fotos-convidados/envios', { method: 'POST', body: { tipo, tamanho: corpo.size, nome: nome.trim(), autor: tokenAutor() } }),
  );
  let enviado = 0;
  let falhas = 0;
  aoProgredir(0);
  while (enviado < corpo.size) {
    const inicio = enviado;
    try {
      enviado = await enviarParte(envio, inicio, corpo.slice(inicio, inicio + parte), (n) => aoProgredir((inicio + n) / corpo.size));
      falhas = 0;
    } catch (error) {
      if (!(error instanceof ErroParte)) throw error;
      // The server has a different amount (a part got there but its answer didn't): go on from there.
      if (error.status === 409 && typeof error.recebido === 'number') {
        enviado = error.recebido;
        continue;
      }
      if (!passageiro(error.status) || ++falhas > 6) throw error;
      await esperar(Math.min(15_000, 1000 * 2 ** falhas));
    }
  }
  aoProgredir(1);
  const enviada = await api<MidiaEnviada>(`/public/fotos-convidados/envios/${envio}/concluir`, { method: 'POST' });
  const lista = minhas();
  lista.add(enviada.uid);
  lembrarMinhas(lista);
  return enviada;
}

export function formatarDuracao(segundos: number | null): string {
  if (!segundos) return '';
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
