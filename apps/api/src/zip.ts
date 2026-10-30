// A minimal ZIP writer (stored entries, no compression: photos are already compressed), streamed one
// file at a time so a whole album never has to sit in memory. Enough for the panel's "download all".
import { crc32 } from 'node:zlib';

// `dados` is read only when that entry is written; null leaves the entry out.
export type ArquivoZip = { nome: string; dados: () => Promise<Buffer | null> };

// DOS date/time of "now" (ZIP's own format).
function dataDos(d: Date): { data: number; hora: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// Past 4 GB (an album with the guests' videos) the offsets no longer fit in the classic fields: those
// entries and the end of the file get the ZIP64 records (each file itself stays well under 4 GB).
const LIMITE_32 = 0xffffffff;

export async function* gerarZip(arquivos: ArquivoZip[]): AsyncGenerator<Buffer> {
  const { data, hora } = dataDos(new Date());
  const central: Buffer[] = [];
  let deslocamento = 0;
  let quantidade = 0;

  for (const arquivo of arquivos) {
    const conteudo = await arquivo.dados();
    if (!conteudo) continue;
    quantidade += 1;
    const nome = Buffer.from(arquivo.nome, 'utf8');
    const crc = crc32(conteudo);
    const longe = deslocamento >= LIMITE_32;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(conteudo.length, 18);
    local.writeUInt32LE(conteudo.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);

    // ZIP64 extra field with just the offset (the only field marked 0xFFFFFFFF).
    const extra = longe ? Buffer.alloc(12) : Buffer.alloc(0);
    if (longe) {
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(8, 2);
      extra.writeBigUInt64LE(BigInt(deslocamento), 4);
    }

    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt16LE(longe ? 45 : 20, 4); // version made by
    entrada.writeUInt16LE(longe ? 45 : 20, 6); // version needed
    entrada.writeUInt16LE(0x0800, 8);
    entrada.writeUInt16LE(0, 10);
    entrada.writeUInt16LE(hora, 12);
    entrada.writeUInt16LE(data, 14);
    entrada.writeUInt32LE(crc, 16);
    entrada.writeUInt32LE(conteudo.length, 20);
    entrada.writeUInt32LE(conteudo.length, 24);
    entrada.writeUInt16LE(nome.length, 28);
    entrada.writeUInt16LE(extra.length, 30);
    entrada.writeUInt32LE(longe ? LIMITE_32 : deslocamento, 42);
    central.push(entrada, nome, extra);

    yield Buffer.concat([local, nome]);
    yield conteudo;
    deslocamento += local.length + nome.length + conteudo.length;
  }

  const diretorio = Buffer.concat(central);
  const zip64 = deslocamento >= LIMITE_32 || quantidade > 0xffff;
  if (zip64) {
    const registro = Buffer.alloc(56);
    registro.writeUInt32LE(0x06064b50, 0);
    registro.writeBigUInt64LE(44n, 4); // size of the rest of this record
    registro.writeUInt16LE(45, 12);
    registro.writeUInt16LE(45, 14);
    registro.writeBigUInt64LE(BigInt(quantidade), 24);
    registro.writeBigUInt64LE(BigInt(quantidade), 32);
    registro.writeBigUInt64LE(BigInt(diretorio.length), 40);
    registro.writeBigUInt64LE(BigInt(deslocamento), 48);
    const localizador = Buffer.alloc(20);
    localizador.writeUInt32LE(0x07064b50, 0);
    localizador.writeBigUInt64LE(BigInt(deslocamento + diretorio.length), 8);
    localizador.writeUInt32LE(1, 16);
    yield diretorio;
    yield Buffer.concat([registro, localizador]);
  } else {
    yield diretorio;
  }
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Math.min(quantidade, 0xffff), 8);
  fim.writeUInt16LE(Math.min(quantidade, 0xffff), 10);
  fim.writeUInt32LE(Math.min(diretorio.length, LIMITE_32), 12);
  fim.writeUInt32LE(zip64 ? LIMITE_32 : deslocamento, 16);
  yield fim;
}
