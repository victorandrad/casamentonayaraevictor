// Photos and videos the guests send from their phones (page /fotos). A file arrives in parts: a phone
// on the party's network drops connections, and one big request would run into the proxies' limits.
// What arrives is checked by its content (not by what the browser says it is) and re-encoded, which
// also drops metadata such as the GPS position: photos become a JPG plus a small WebP, videos are
// converted by ffmpeg in the background to an MP4 that plays on any device.
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp, { type OutputInfo } from 'sharp';
import { casamento } from '@nv/shared/config';
import type { FotosConvidados, MidiaConvidado, MidiaConvidadoAdmin, MidiaEnviada, ModoFotosConvidados } from '@nv/shared/types';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';
import { getConfig, setConfig } from './repo.ts';
import { UPLOADS_PREFIX } from './uploads.ts';

const executar = promisify(execFile);

export class MidiaInvalida extends Error {}
export class EnvioNaoEncontrado extends Error {}
export class ParteForaDeOrdem extends Error {
  recebido: number;
  constructor(recebido: number) {
    super('Parte fora de ordem.');
    this.recebido = recebido;
  }
}

// Served at /api/uploads/convidados/; the queue (parts and videos waiting to be converted) is in a
// dot folder, which the static server never serves.
const PASTA = join(config.uploadsDir, 'convidados');
const FILA = join(config.uploadsDir, '.convidados-fila');
const PREFIXO_URL = `${UPLOADS_PREFIX}convidados/`;

export const TAMANHO_PARTE = 4 * 1024 * 1024;
export const MAX_FOTO_BYTES = 40 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 400 * 1024 * 1024;
export const MAX_VIDEO_SEGUNDOS = 60;
const LADO_FOTO = 2560;
const LADO_MINIATURA = 640;
// Room kept free on the server's disk (the database and the site live there too).
const RESERVA_DISCO = 2 * 1024 * 1024 * 1024;
const POR_PAGINA = 48;

export async function garantirPastasFotosConvidados() {
  await mkdir(PASTA, { recursive: true });
  await mkdir(FILA, { recursive: true });
}

// ---- Open or closed ----

// 'automatico' opens on the wedding day (midnight in Brasília) and stays open.
const ABRE_EM = new Date(`${casamento.dataISO.slice(0, 10)}T00:00:00-03:00`);

export async function modoFotosConvidados(): Promise<ModoFotosConvidados> {
  const valor = await getConfig('fotos_convidados', 'automatico');
  return valor === 'aberto' || valor === 'fechado' ? valor : 'automatico';
}

export const definirModoFotosConvidados = (modo: ModoFotosConvidados) => setConfig('fotos_convidados', modo);

export async function envioAberto(): Promise<{ aberto: boolean; abreEm: string | null }> {
  const modo = await modoFotosConvidados();
  if (modo === 'aberto') return { aberto: true, abreEm: null };
  if (modo === 'fechado') return { aberto: false, abreEm: null };
  const aberto = Date.now() >= ABRE_EM.getTime();
  return { aberto, abreEm: aberto ? null : ABRE_EM.toISOString() };
}

// ---- Receiving a file in parts ----

type Envio = {
  tipo: 'foto' | 'video';
  tamanho: number;
  recebido: number;
  caminho: string;
  nome: string;
  autorHash: string;
  ip: string;
  ocupado: boolean;
  ultimaVez: number;
};

// In memory: one API instance, and an upload cut by a restart is simply sent again.
const envios = new Map<string, Envio>();
const MAX_ENVIOS_POR_IP = 12;
const MAX_ENVIOS = 150;
const ENVIO_PARADO_MS = 30 * 60_000;

export const hashAutor = (token: string) => createHash('sha256').update(token).digest('hex');

export async function iniciarEnvio(dados: { tipo: 'foto' | 'video'; tamanho: number; nome: string; autor: string }, ip: string): Promise<string> {
  const limite = dados.tipo === 'foto' ? MAX_FOTO_BYTES : MAX_VIDEO_BYTES;
  if (dados.tamanho > limite) {
    throw new MidiaInvalida(dados.tipo === 'foto' ? 'A foto passa de 40 MB.' : 'O vídeo passa de 400 MB. Envie um trecho mais curto.');
  }
  const abertos = [...envios.values()];
  if (abertos.length >= MAX_ENVIOS || abertos.filter((e) => e.ip === ip).length >= MAX_ENVIOS_POR_IP) {
    throw new MidiaInvalida('Muitos envios ao mesmo tempo. Espere os que estão em andamento terminarem.');
  }
  const disco = await statfs(config.uploadsDir);
  const reservado = abertos.reduce((soma, e) => soma + e.tamanho, 0);
  if (disco.bavail * disco.bsize - reservado - dados.tamanho < RESERVA_DISCO) {
    throw new MidiaInvalida('O espaço para fotos acabou. Avise os noivos!');
  }
  const id = randomBytes(16).toString('hex');
  const caminho = join(FILA, `${id}.parte`);
  await writeFile(caminho, '');
  envios.set(id, {
    tipo: dados.tipo,
    tamanho: dados.tamanho,
    recebido: 0,
    caminho,
    nome: dados.nome.trim().replace(/\s+/g, ' ').slice(0, 60),
    autorHash: hashAutor(dados.autor),
    ip,
    ocupado: false,
    ultimaVez: Date.now(),
  });
  return id;
}

// Appends one part. A part that already arrived (the answer got lost and the phone sent it again) is
// accepted without writing twice; any other gap answers with how much the server has.
export async function receberParte(id: string, inicio: number, dados: Buffer): Promise<number> {
  const envio = envios.get(id);
  if (!envio) throw new EnvioNaoEncontrado();
  if (envio.ocupado) throw new ParteForaDeOrdem(envio.recebido);
  if (inicio < envio.recebido && inicio + dados.length <= envio.recebido) return envio.recebido;
  if (inicio !== envio.recebido) throw new ParteForaDeOrdem(envio.recebido);
  if (envio.recebido + dados.length > envio.tamanho) throw new MidiaInvalida('O arquivo é maior do que o informado.');
  envio.ocupado = true;
  try {
    const arquivo = await open(envio.caminho, 'a');
    try {
      await arquivo.write(dados);
    } finally {
      await arquivo.close();
    }
    envio.recebido += dados.length;
    envio.ultimaVez = Date.now();
    return envio.recebido;
  } finally {
    envio.ocupado = false;
  }
}

async function descartarEnvio(id: string) {
  const envio = envios.get(id);
  envios.delete(id);
  if (envio) await rm(envio.caminho, { force: true });
}

// Uploads nobody finished (the guest closed the page) are dropped after a while.
async function limparEnviosParados() {
  const limite = Date.now() - ENVIO_PARADO_MS;
  for (const [id, envio] of envios) {
    if (!envio.ocupado && envio.ultimaVez < limite) await descartarEnvio(id);
  }
}

const novoNome = () => randomBytes(16).toString('hex');

// The whole file is here: a photo is re-encoded right away, a video goes to the conversion queue.
export async function concluirEnvio(id: string): Promise<MidiaEnviada> {
  const envio = envios.get(id);
  if (!envio) throw new EnvioNaoEncontrado();
  if (envio.ocupado || envio.recebido !== envio.tamanho) throw new ParteForaDeOrdem(envio.recebido);
  envios.delete(id);
  try {
    if (envio.tipo === 'foto') {
      const foto = await processarFoto(await readFile(envio.caminho));
      const linha = await queryOne<{ uid: string }>(
        `INSERT INTO fotos_convidados (tipo, estado, arquivo, miniatura, largura, altura, bytes, nome, autor_hash)
         VALUES ('foto', 'pronto', $1, $2, $3, $4, $5, $6, $7) RETURNING uid`,
        [foto.arquivo, foto.miniatura, foto.largura, foto.altura, foto.bytes, envio.nome, envio.autorHash],
      );
      return { uid: linha!.uid, tipo: 'foto', estado: 'pronto' };
    }
    await sondarVideo(envio.caminho);
    const original = join(FILA, `${novoNome()}.original`);
    await rename(envio.caminho, original);
    const linha = await queryOne<{ uid: string }>(
      `INSERT INTO fotos_convidados (tipo, estado, original, bytes, nome, autor_hash)
       VALUES ('video', 'processando', $1, $2, $3, $4) RETURNING uid`,
      [original, envio.tamanho, envio.nome, envio.autorHash],
    );
    void converterVideos();
    return { uid: linha!.uid, tipo: 'video', estado: 'processando' };
  } finally {
    await rm(envio.caminho, { force: true });
  }
}

// ---- Photos ----

async function processarFoto(conteudo: Buffer) {
  let foto: { data: Buffer; info: OutputInfo };
  try {
    foto = await sharp(conteudo, { limitInputPixels: 120_000_000 })
      .rotate() // honour the phone's orientation before metadata is dropped
      .resize({ width: LADO_FOTO, height: LADO_FOTO, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new MidiaInvalida('Não foi possível ler essa foto. Envie em JPG, PNG ou WebP.');
  }
  const miniatura = await sharp(foto.data)
    .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 74 })
    .toBuffer();
  const nome = novoNome();
  await writeFile(join(PASTA, `${nome}.jpg`), foto.data);
  await writeFile(join(PASTA, `${nome}.webp`), miniatura);
  return { arquivo: `${nome}.jpg`, miniatura: `${nome}.webp`, largura: foto.info.width, altura: foto.info.height, bytes: foto.data.length };
}

// ---- Videos ----

type Sonda = {
  format?: { format_name?: string; duration?: string };
  streams?: Array<{ codec_type?: string; width?: number; height?: number; disposition?: { attached_pic?: number } }>;
};

async function sondar(caminho: string): Promise<Sonda> {
  const { stdout } = await executar('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', caminho], {
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout) as Sonda;
}

// A real video (MP4/MOV/WebM, with a picture) of at most a minute.
async function sondarVideo(caminho: string): Promise<{ duracao: number }> {
  let sonda: Sonda;
  try {
    sonda = await sondar(caminho);
  } catch {
    throw new MidiaInvalida('Não foi possível ler esse vídeo. Envie em MP4 ou MOV.');
  }
  const formato = sonda.format?.format_name ?? '';
  const duracao = Number(sonda.format?.duration);
  const temImagem = sonda.streams?.some((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!/mov|mp4|3gp|matroska|webm/.test(formato) || !temImagem || !(duracao > 0)) {
    throw new MidiaInvalida('Não foi possível ler esse vídeo. Envie em MP4 ou MOV.');
  }
  if (duracao > MAX_VIDEO_SEGUNDOS + 1) throw new MidiaInvalida('O vídeo passa de 1 minuto. Envie um trecho mais curto.');
  return { duracao };
}

// H.264 up to 1080p (the longer side up to 1920), AAC sound, no metadata, ready to start playing
// before it has fully loaded. `nice` keeps the site responsive while it converts.
async function converter(original: string) {
  const nome = novoNome();
  const saida = join(PASTA, `${nome}.mp4`);
  try {
    await executar(
      'nice',
      [
        '-n', '10', 'ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', original,
        '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn',
        '-t', String(MAX_VIDEO_SEGUNDOS + 1),
        '-vf', "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
        '-fpsmax', '60',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
        '-movflags', '+faststart', '-threads', '2',
        saida,
      ],
      { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const sonda = await sondar(saida);
    const video = sonda.streams?.find((s) => s.codec_type === 'video');
    const duracao = Number(sonda.format?.duration) || 0;
    // The cover: a frame from early in the video.
    const { stdout: quadro } = await executar(
      'ffmpeg',
      ['-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.min(0.5, duracao / 2)), '-i', saida, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'],
      { timeout: 60_000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' },
    );
    const capa = await sharp(quadro)
      .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 74 })
      .toBuffer();
    await writeFile(join(PASTA, `${nome}.webp`), capa);
    const { size } = await stat(saida);
    return { arquivo: `${nome}.mp4`, miniatura: `${nome}.webp`, largura: video?.width ?? 0, altura: video?.height ?? 0, duracao, bytes: size };
  } catch (error) {
    await rm(saida, { force: true });
    await rm(join(PASTA, `${nome}.webp`), { force: true });
    throw error;
  }
}

// Converts the queued videos one at a time (runs after each upload and every minute, which also picks
// up what a restart interrupted).
let convertendo = false;
export async function converterVideos(): Promise<void> {
  if (convertendo) return;
  convertendo = true;
  try {
    for (;;) {
      const video = await queryOne<{ id: number; original: string | null }>(
        "SELECT id, original FROM fotos_convidados WHERE estado = 'processando' ORDER BY id LIMIT 1",
      );
      if (!video) break;
      try {
        if (!video.original) throw new Error('vídeo sem o arquivo original');
        const pronto = await converter(video.original);
        const atualizado = await queryOne(
          `UPDATE fotos_convidados SET estado = 'pronto', arquivo = $2, miniatura = $3, largura = $4, altura = $5, duracao = $6,
                  bytes = $7, original = NULL
            WHERE id = $1 AND estado = 'processando' RETURNING id`,
          [video.id, pronto.arquivo, pronto.miniatura, pronto.largura, pronto.altura, pronto.duracao, pronto.bytes],
        );
        // Deleted while it was being converted.
        if (!atualizado) await removerArquivos({ arquivo: pronto.arquivo, miniatura: pronto.miniatura, original: null });
      } catch (error) {
        console.warn(`vídeo ${video.id} não convertido:`, (error as Error).message);
        await query("UPDATE fotos_convidados SET estado = 'falhou', original = NULL WHERE id = $1", [video.id]);
      }
      if (video.original) await rm(video.original, { force: true });
    }
    await limparEnviosParados();
  } finally {
    convertendo = false;
  }
}

// Leftovers in the queue folder that nothing points to any more (a part from before a restart).
export async function limparFila() {
  const emUso = new Set((await query<{ original: string }>('SELECT original FROM fotos_convidados WHERE original IS NOT NULL')).map((l) => l.original));
  for (const envio of envios.values()) emUso.add(envio.caminho);
  for (const nome of await readdir(FILA)) {
    const caminho = join(FILA, nome);
    if (!emUso.has(caminho)) await rm(caminho, { force: true });
  }
}

// ---- Listing and removing ----

type Linha = {
  id: number;
  uid: string;
  tipo: 'foto' | 'video';
  estado: 'processando' | 'pronto' | 'falhou';
  arquivo: string | null;
  miniatura: string | null;
  largura: number | null;
  altura: number | null;
  duracao: number | null;
  bytes: string;
  nome: string;
  visivel: boolean;
  criado_em: Date;
};

const COLUNAS = 'id, uid, tipo, estado, arquivo, miniatura, largura, altura, duracao, bytes, nome, visivel, criado_em';
const url = (arquivo: string | null) => (arquivo ? PREFIXO_URL + arquivo : null);

const paraPublico = (l: Linha): MidiaConvidado => ({
  uid: l.uid,
  tipo: l.tipo,
  url: url(l.arquivo)!,
  miniatura: url(l.miniatura)!,
  largura: l.largura ?? 0,
  altura: l.altura ?? 0,
  duracao: l.duracao,
  nome: l.nome,
  criadoEm: l.criado_em.toISOString(),
});

// The site's feed, newest first, a page at a time (`depois`: the last one already shown).
export async function listarFotosConvidados(depois: string | null): Promise<FotosConvidados> {
  const linhas = await query<Linha>(
    `SELECT ${COLUNAS} FROM fotos_convidados
      WHERE visivel AND estado = 'pronto'
        AND ($1::uuid IS NULL OR id < (SELECT id FROM fotos_convidados WHERE uid = $1))
      ORDER BY id DESC LIMIT $2`,
    [depois, POR_PAGINA + 1],
  );
  const pagina = linhas.slice(0, POR_PAGINA);
  return {
    ...(await envioAberto()),
    itens: pagina.map(paraPublico),
    proxima: linhas.length > POR_PAGINA ? pagina[pagina.length - 1].uid : null,
  };
}

export async function listarFotosConvidadosAdmin(): Promise<MidiaConvidadoAdmin[]> {
  const linhas = await query<Linha>(`SELECT ${COLUNAS} FROM fotos_convidados ORDER BY id DESC`);
  return linhas.map((l) => ({
    ...paraPublico(l),
    id: l.id,
    url: url(l.arquivo),
    miniatura: url(l.miniatura),
    estado: l.estado,
    visivel: l.visivel,
    bytes: Number(l.bytes),
  }));
}

export async function mostrarFotoConvidado(id: number, visivel: boolean): Promise<MidiaConvidadoAdmin | null> {
  const linha = await queryOne<{ id: number }>('UPDATE fotos_convidados SET visivel = $2 WHERE id = $1 RETURNING id', [id, visivel]);
  if (!linha) return null;
  return (await listarFotosConvidadosAdmin()).find((m) => m.id === id) ?? null;
}

type Arquivos = { arquivo: string | null; miniatura: string | null; original: string | null };

async function removerArquivos(a: Arquivos) {
  for (const nome of [a.arquivo, a.miniatura]) {
    if (nome && /^[a-f0-9]{32}\.(jpg|webp|mp4)$/.test(nome)) await rm(join(PASTA, nome), { force: true });
  }
  if (a.original?.startsWith(FILA)) await rm(a.original, { force: true });
}

// By the couple (panel) or by whoever sent it (the token kept on their phone).
export async function excluirFotoConvidado(alvo: { id: number } | { uid: string; autor: string }): Promise<boolean> {
  const linha =
    'id' in alvo
      ? await queryOne<Arquivos>('DELETE FROM fotos_convidados WHERE id = $1 RETURNING arquivo, miniatura, original', [alvo.id])
      : await queryOne<Arquivos>('DELETE FROM fotos_convidados WHERE uid = $1 AND autor_hash = $2 RETURNING arquivo, miniatura, original', [
          alvo.uid,
          hashAutor(alvo.autor),
        ]);
  if (!linha) return false;
  await removerArquivos(linha);
  return true;
}

// Everything on the site, oldest first, for the album download.
export async function arquivosParaBaixar(): Promise<Array<{ nome: string; dados: () => Promise<Buffer | null> }>> {
  const linhas = await query<Linha>(`SELECT ${COLUNAS} FROM fotos_convidados WHERE visivel AND estado = 'pronto' ORDER BY id`);
  const largura = Math.max(3, String(linhas.length).length);
  const slug = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  return linhas.map((l, i) => ({
    nome: `${String(i + 1).padStart(largura, '0')}-${slug(l.nome) || 'convidado'}.${l.tipo === 'foto' ? 'jpg' : 'mp4'}`,
    dados: () => readFile(join(PASTA, l.arquivo!)).catch(() => null),
  }));
}
