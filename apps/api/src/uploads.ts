// Photos uploaded from the panel (gifts and gallery). Every image is re-encoded with
// sharp (resized to fit, WebP), which also strips metadata such as GPS and
// guarantees we only ever store and serve real images.
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { config } from './config.ts';

export const UPLOADS_PREFIX = '/api/uploads/';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'];
const NOME_ARQUIVO = /^[a-f0-9]{32}\.webp$/;

export class ImagemInvalida extends Error {}

export async function garantirPastaUploads() {
  await mkdir(config.uploadsDir, { recursive: true });
}

// Gift photos show small; gallery photos open full screen.
export const LADO_PRESENTE = 1200;
export const LADO_GALERIA = 2000;

export async function salvarImagem(conteudo: Buffer, lado = LADO_PRESENTE): Promise<string> {
  let webp: Buffer;
  try {
    webp = await sharp(conteudo, { limitInputPixels: 50_000_000 })
      .rotate() // honour the phone's orientation before metadata is dropped
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ImagemInvalida('Não foi possível ler essa imagem. Envie uma foto em JPG, PNG ou WebP.');
  }
  const nome = `${randomBytes(16).toString('hex')}.webp`;
  await writeFile(join(config.uploadsDir, nome), webp);
  return `${UPLOADS_PREFIX}${nome}`;
}

// Deletes a previously uploaded photo; ignores external links and missing files.
export async function removerImagem(url: string | null | undefined) {
  if (!url?.startsWith(UPLOADS_PREFIX)) return;
  const nome = url.slice(UPLOADS_PREFIX.length);
  if (!NOME_ARQUIVO.test(nome)) return;
  await unlink(join(config.uploadsDir, nome)).catch(() => {});
}
