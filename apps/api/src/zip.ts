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

    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt16LE(20, 4); // version made by
    entrada.writeUInt16LE(20, 6); // version needed
    entrada.writeUInt16LE(0x0800, 8);
    entrada.writeUInt16LE(0, 10);
    entrada.writeUInt16LE(hora, 12);
    entrada.writeUInt16LE(data, 14);
    entrada.writeUInt32LE(crc, 16);
    entrada.writeUInt32LE(conteudo.length, 20);
    entrada.writeUInt32LE(conteudo.length, 24);
    entrada.writeUInt16LE(nome.length, 28);
    entrada.writeUInt32LE(deslocamento, 42);
    central.push(entrada, nome);

    yield Buffer.concat([local, nome]);
    yield conteudo;
    deslocamento += local.length + nome.length + conteudo.length;
  }

  const diretorio = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(quantidade, 8);
  fim.writeUInt16LE(quantidade, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  yield diretorio;
  yield fim;
}
