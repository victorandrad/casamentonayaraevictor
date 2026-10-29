// SQL access and row → API shape mapping.
import { randomInt } from 'node:crypto';
import type {
  Categoria,
  CategoriaInput,
  Checkin,
  FotoGaleria,
  FotoGaleriaInput,
  OrganizacaoLista,
  ConvidadoAdmin,
  ConvidadoInput,
  ConvitePublico,
  Presente,
  PresenteInput,
  Recado,
  RecadoAdmin,
  Resposta,
  RespostaInput,
  Resumo,
} from '@nv/shared/types';
import { TAXA_PADRAO, type Taxa } from '@nv/shared/taxas';
import { query, queryOne, transaction } from './db.ts';

type ConvidadoRow = {
  id: number;
  codigo: string;
  nome: string;
  limite_acompanhantes: number;
  criado_em: Date;
  status: 'sim' | 'nao' | null;
  acompanhantes: number | null;
  mensagem: string | null;
  respondido_em: Date | null;
};

const CONVIDADO_SELECT = `
  SELECT c.id, c.codigo, c.nome, c.limite_acompanhantes, c.criado_em,
         r.status, r.acompanhantes, r.mensagem, r.respondido_em
  FROM convidados c LEFT JOIN respostas r ON r.convidado_id = c.id`;

function toResposta(row: ConvidadoRow): Resposta | null {
  if (!row.status) return null;
  return {
    status: row.status,
    acompanhantes: row.acompanhantes ?? 0,
    mensagem: row.mensagem ?? '',
    respondidoEm: row.respondido_em!.toISOString(),
  };
}

function toConvidadoAdmin(row: ConvidadoRow): ConvidadoAdmin {
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    limiteAcompanhantes: row.limite_acompanhantes,
    criadoEm: row.criado_em.toISOString(),
    resposta: toResposta(row),
  };
}

export const normalizeCodigo = (codigo: string) => codigo.trim().toUpperCase();

// ---- Convidados ----

export async function findConvite(codigo: string): Promise<(ConvitePublico & { id: number }) | null> {
  const row = await queryOne<ConvidadoRow>(`${CONVIDADO_SELECT} WHERE c.codigo = $1`, [normalizeCodigo(codigo)]);
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    limiteAcompanhantes: row.limite_acompanhantes,
    resposta: toResposta(row),
  };
}

export async function saveResposta(convidadoId: number, input: RespostaInput): Promise<void> {
  await query(
    `INSERT INTO respostas (convidado_id, status, acompanhantes, mensagem, respondido_em)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (convidado_id) DO UPDATE
       SET status = EXCLUDED.status, acompanhantes = EXCLUDED.acompanhantes,
           mensagem = EXCLUDED.mensagem, respondido_em = now()`,
    [convidadoId, input.status, input.status === 'sim' ? input.acompanhantes : 0, input.mensagem],
  );
}

export async function findCheckin(codigo: string): Promise<Checkin | null> {
  const convite = await findConvite(codigo);
  if (!convite) return null;
  return {
    codigo: convite.codigo,
    nome: convite.nome,
    status: convite.resposta?.status ?? 'pendente',
    acompanhantes: convite.resposta?.acompanhantes ?? 0,
  };
}

export async function listConvidados(): Promise<ConvidadoAdmin[]> {
  const rows = await query<ConvidadoRow>(`${CONVIDADO_SELECT} ORDER BY lower(c.nome)`);
  return rows.map(toConvidadoAdmin);
}

async function getConvidado(id: number): Promise<ConvidadoAdmin | null> {
  const row = await queryOne<ConvidadoRow>(`${CONVIDADO_SELECT} WHERE c.id = $1`, [id]);
  return row ? toConvidadoAdmin(row) : null;
}

// Readable codes without look-alike characters (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCodigo() {
  let code = 'NV-';
  for (let i = 0; i < 4; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export async function createConvidado(input: ConvidadoInput): Promise<ConvidadoAdmin> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO convidados (codigo, nome, limite_acompanhantes) VALUES ($1, $2, $3)
       ON CONFLICT (codigo) DO NOTHING RETURNING id`,
      [newCodigo(), input.nome, input.limiteAcompanhantes],
    );
    if (row) return (await getConvidado(row.id))!;
  }
  throw new Error('Não foi possível gerar um código único');
}

export async function updateConvidado(id: number, input: ConvidadoInput): Promise<ConvidadoAdmin | null> {
  const row = await queryOne<{ id: number }>(
    'UPDATE convidados SET nome = $2, limite_acompanhantes = $3 WHERE id = $1 RETURNING id',
    [id, input.nome, input.limiteAcompanhantes],
  );
  if (!row) return null;
  // Keep an existing answer within the new limit
  await query('UPDATE respostas SET acompanhantes = LEAST(acompanhantes, $2) WHERE convidado_id = $1', [
    id,
    input.limiteAcompanhantes,
  ]);
  return getConvidado(id);
}

export async function deleteConvidado(id: number): Promise<boolean> {
  return (await query('DELETE FROM convidados WHERE id = $1 RETURNING id', [id])).length > 0;
}

export async function resumo(): Promise<Resumo> {
  const row = await queryOne<Record<keyof Resumo, string>>(`
    SELECT
      (SELECT count(*) FROM convidados) AS convidados,
      (SELECT count(*) FROM respostas) AS responderam,
      (SELECT count(*) FROM respostas WHERE status = 'sim') AS confirmados,
      (SELECT coalesce(sum(1 + acompanhantes), 0) FROM respostas WHERE status = 'sim') AS "pessoasConfirmadas",
      (SELECT count(*) FROM respostas WHERE status = 'nao') AS recusaram,
      (SELECT count(*) FROM convidados c WHERE NOT EXISTS (SELECT 1 FROM respostas r WHERE r.convidado_id = c.id)) AS pendentes,
      (SELECT count(*) FROM recados) AS recados,
      (SELECT count(*) FROM recados WHERE NOT visivel) AS "recadosOcultos",
      (SELECT count(*) FROM presentes) AS presentes,
      (SELECT count(*) FROM pedidos WHERE status = 'pago') AS "presentesRecebidos",
      (SELECT coalesce(sum(total_centavos), 0) FROM pedidos WHERE status = 'pago') AS "totalRecebidoCentavos",
      (SELECT coalesce(sum(taxa_centavos), 0) FROM pedidos WHERE status = 'pago') AS "totalTaxasCentavos",
      (SELECT coalesce(sum(coalesce(liquido_centavos, total_centavos)), 0) FROM pedidos WHERE status = 'pago') AS "totalLiquidoCentavos"`);
  return Object.fromEntries(Object.entries(row!).map(([k, v]) => [k, Number(v)])) as Resumo;
}

// ---- Recados ----

type RecadoRow = { id: number; nome: string; mensagem: string; visivel: boolean; criado_em: Date };
const toRecadoAdmin = (r: RecadoRow): RecadoAdmin => ({
  id: r.id,
  nome: r.nome,
  mensagem: r.mensagem,
  visivel: r.visivel,
  criadoEm: r.criado_em.toISOString(),
});

export async function listRecadosPublicos(): Promise<Recado[]> {
  const rows = await query<RecadoRow>(
    'SELECT id, nome, mensagem, visivel, criado_em FROM recados WHERE visivel ORDER BY criado_em DESC LIMIT 200',
  );
  return rows.map((r) => ({ id: r.id, nome: r.nome, mensagem: r.mensagem, criadoEm: r.criado_em.toISOString() }));
}

export async function listRecadosAdmin(): Promise<RecadoAdmin[]> {
  const rows = await query<RecadoRow>('SELECT id, nome, mensagem, visivel, criado_em FROM recados ORDER BY criado_em DESC');
  return rows.map(toRecadoAdmin);
}

export async function createRecado(nome: string, mensagem: string): Promise<Recado> {
  const row = (await queryOne<RecadoRow>(
    'INSERT INTO recados (nome, mensagem) VALUES ($1, $2) RETURNING id, nome, mensagem, visivel, criado_em',
    [nome, mensagem],
  ))!;
  return { id: row.id, nome: row.nome, mensagem: row.mensagem, criadoEm: row.criado_em.toISOString() };
}

export async function setRecadoVisivel(id: number, visivel: boolean): Promise<RecadoAdmin | null> {
  const row = await queryOne<RecadoRow>(
    'UPDATE recados SET visivel = $2 WHERE id = $1 RETURNING id, nome, mensagem, visivel, criado_em',
    [id, visivel],
  );
  return row ? toRecadoAdmin(row) : null;
}

export async function deleteRecado(id: number): Promise<boolean> {
  return (await query('DELETE FROM recados WHERE id = $1 RETURNING id', [id])).length > 0;
}

// ---- Categorias ----

export async function listCategorias(): Promise<Categoria[]> {
  return query<Categoria>('SELECT id, nome, icone, ordem FROM categorias ORDER BY ordem, id');
}

export class NomeDuplicado extends Error {}

// Unique-name violations become a friendly error.
async function comNomeUnico<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new NomeDuplicado('Já existe uma categoria com esse nome.');
    throw error;
  }
}

export async function createCategoria(input: CategoriaInput): Promise<Categoria> {
  return comNomeUnico(async () =>
    (await queryOne<Categoria>(
      `INSERT INTO categorias (nome, icone, ordem)
       VALUES ($1, $2, (SELECT coalesce(max(ordem), 0) + 1 FROM categorias))
       RETURNING id, nome, icone, ordem`,
      [input.nome, input.icone],
    ))!,
  );
}

export async function updateCategoria(id: number, input: CategoriaInput): Promise<Categoria | null> {
  return comNomeUnico(() =>
    queryOne<Categoria>('UPDATE categorias SET nome = $2, icone = $3 WHERE id = $1 RETURNING id, nome, icone, ordem', [
      id,
      input.nome,
      input.icone,
    ]),
  );
}

// Order follows the given ids; categories left out keep their place after them.
export async function ordenarCategorias(ids: number[]): Promise<Categoria[]> {
  await query(
    `UPDATE categorias c SET ordem = o.pos
       FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos)
      WHERE c.id = o.id`,
    [ids],
  );
  return listCategorias();
}

// Deletes a category. Its gifts move to `moverPara` first; without it, a
// category that still has gifts is kept ('tem_presentes').
export async function deleteCategoria(id: number, moverPara?: number): Promise<'ok' | 'nao_encontrada' | 'tem_presentes' | 'destino_invalido'> {
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: number }>('SELECT id FROM categorias WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) return 'nao_encontrada';
    if (moverPara !== undefined) {
      if (moverPara === id) return 'destino_invalido';
      const destino = await client.query('SELECT 1 FROM categorias WHERE id = $1', [moverPara]);
      if (!destino.rowCount) return 'destino_invalido';
      await client.query(
        `UPDATE presentes SET categoria_id = $2,
                ordem = ordem + (SELECT coalesce(max(ordem), 0) FROM presentes WHERE categoria_id = $2)
          WHERE categoria_id = $1`,
        [id, moverPara],
      );
    }
    const restantes = await client.query('SELECT 1 FROM presentes WHERE categoria_id = $1 LIMIT 1', [id]);
    if (restantes.rowCount) return 'tem_presentes';
    await client.query('DELETE FROM categorias WHERE id = $1', [id]);
    return 'ok';
  });
}

// Saves the drag-and-drop layout: category order, and each gift's category and
// position. Returns false if a category in it no longer exists.
export async function organizarLista(lista: OrganizacaoLista): Promise<boolean> {
  return transaction(async (client) => {
    const ids = lista.map((c) => c.id);
    const { rowCount } = await client.query('SELECT 1 FROM categorias WHERE id = ANY($1::int[])', [ids]);
    if (rowCount !== ids.length) return false;
    await client.query(
      `UPDATE categorias c SET ordem = o.pos FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos) WHERE c.id = o.id`,
      [ids],
    );
    const presentes = lista.flatMap((c) => c.presentes.map((uid, i) => ({ id: uid, categoria: c.id, ordem: i + 1 })));
    await client.query(
      `UPDATE presentes p SET categoria_id = o.categoria, ordem = o.ordem
         FROM unnest($1::uuid[], $2::int[], $3::int[]) AS o(uid, categoria, ordem)
        WHERE p.uid = o.uid`,
      [presentes.map((p) => p.id), presentes.map((p) => p.categoria), presentes.map((p) => p.ordem)],
    );
    return true;
  });
}

export async function categoriaExiste(id: number): Promise<boolean> {
  return !!(await queryOne('SELECT 1 FROM categorias WHERE id = $1', [id]));
}

// ---- Presentes ----

// How long an unpaid checkout keeps its gifts reserved. Mercado Pago preferences are
// created to expire after 30 minutes; a little slack covers clock differences.
export const RESERVA_MINUTOS = 35;

// `id` is the internal key (joins with pedido_itens); `uid` is the only identifier that leaves the
// database — the site, the panel and the API know a gift by it (see migration 012).
type PresenteRow = {
  id: number;
  uid: string;
  categoria_id: number;
  nome: string;
  valor_centavos: number;
  foto_url: string | null;
  quantidade_maxima: number | null;
  presenteados: string;
  reservados: string;
};

// Paid units, plus units in checkouts that can still be paid (reserved).
export const PRESENTE_SELECT = `
  SELECT p.id, p.uid, p.categoria_id, p.nome, p.valor_centavos, p.foto_url, p.quantidade_maxima,
         coalesce(v.presenteados, 0) AS presenteados, coalesce(v.reservados, 0) AS reservados
    FROM presentes p
    LEFT JOIN (
      SELECT i.presente_id,
             sum(i.quantidade) FILTER (WHERE pe.status = 'pago') AS presenteados,
             sum(i.quantidade) FILTER (
               WHERE pe.status = 'aguardando'
                  OR (pe.status = 'pendente' AND pe.criado_em > now() - interval '${RESERVA_MINUTOS} minutes')
             ) AS reservados
        FROM pedido_itens i
        JOIN pedidos pe ON pe.id = i.pedido_id
       GROUP BY i.presente_id
    ) v ON v.presente_id = p.id`;

export const toPresente = (r: PresenteRow): Presente => {
  const presenteados = Number(r.presenteados);
  const reservados = Number(r.reservados);
  return {
    id: r.uid,
    categoriaId: r.categoria_id,
    nome: r.nome,
    valorCentavos: r.valor_centavos,
    fotoUrl: r.foto_url,
    quantidadeMaxima: r.quantidade_maxima,
    disponivel: r.quantidade_maxima === null ? null : Math.max(0, r.quantidade_maxima - presenteados - reservados),
    presenteados,
  };
};

export async function listPresentes(): Promise<Presente[]> {
  const rows = await query<PresenteRow>(`${PRESENTE_SELECT} JOIN categorias c ON c.id = p.categoria_id ORDER BY c.ordem, c.id, p.ordem, p.id`);
  return rows.map(toPresente);
}

async function getPresente(uid: string): Promise<Presente | null> {
  const row = await queryOne<PresenteRow>(`${PRESENTE_SELECT} WHERE p.uid = $1`, [uid]);
  return row ? toPresente(row) : null;
}

export async function createPresente(input: PresenteInput): Promise<Presente> {
  const row = await queryOne<{ uid: string }>(
    `INSERT INTO presentes (categoria_id, nome, valor_centavos, foto_url, quantidade_maxima, ordem)
     VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(ordem), 0) + 1 FROM presentes WHERE categoria_id = $1))
     RETURNING uid`,
    [input.categoriaId, input.nome, input.valorCentavos, input.fotoUrl || null, input.quantidadeMaxima],
  );
  return (await getPresente(row!.uid))!;
}

export async function updatePresente(uid: string, input: PresenteInput): Promise<Presente | null> {
  const row = await queryOne<{ uid: string }>(
    `UPDATE presentes SET categoria_id = $2, nome = $3, valor_centavos = $4, foto_url = $5, quantidade_maxima = $6
      WHERE uid = $1 RETURNING uid`,
    [uid, input.categoriaId, input.nome, input.valorCentavos, input.fotoUrl || null, input.quantidadeMaxima],
  );
  return row ? getPresente(uid) : null;
}

export async function deletePresente(uid: string): Promise<boolean> {
  return (await query('DELETE FROM presentes WHERE uid = $1 RETURNING uid', [uid])).length > 0;
}

// ---- Galeria ----

const FOTO_COLUNAS = 'id, url, legenda, momento, ordem';

export async function listFotos(): Promise<FotoGaleria[]> {
  return query<FotoGaleria>(`SELECT ${FOTO_COLUNAS} FROM galeria_fotos ORDER BY ordem, id`);
}

// New photos go to the end of the gallery.
export async function createFoto(input: FotoGaleriaInput): Promise<FotoGaleria> {
  return (await queryOne<FotoGaleria>(
    `INSERT INTO galeria_fotos (url, legenda, momento, ordem)
     VALUES ($1, $2, $3, (SELECT coalesce(max(ordem), 0) + 1 FROM galeria_fotos))
     RETURNING ${FOTO_COLUNAS}`,
    [input.url, input.legenda, input.momento],
  ))!;
}

// Returns the updated photo and the previous file (to delete it when the image was replaced).
export async function updateFoto(id: number, input: FotoGaleriaInput): Promise<{ foto: FotoGaleria; urlAnterior: string } | null> {
  const anterior = await queryOne<{ url: string }>('SELECT url FROM galeria_fotos WHERE id = $1', [id]);
  if (!anterior) return null;
  const foto = await queryOne<FotoGaleria>(
    `UPDATE galeria_fotos SET url = $2, legenda = $3, momento = $4 WHERE id = $1 RETURNING ${FOTO_COLUNAS}`,
    [id, input.url, input.legenda, input.momento],
  );
  return foto ? { foto, urlAnterior: anterior.url } : null;
}

export async function deleteFoto(id: number): Promise<string | null> {
  return (await queryOne<{ url: string }>('DELETE FROM galeria_fotos WHERE id = $1 RETURNING url', [id]))?.url ?? null;
}

// Order follows the given ids (drag and drop in the panel).
export async function ordenarFotos(ids: number[]): Promise<FotoGaleria[]> {
  await query(
    `UPDATE galeria_fotos g SET ordem = o.pos FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos) WHERE g.id = o.id`,
    [ids],
  );
  return listFotos();
}

// ---- Configurações ----

export async function getConfig(chave: string, fallback = ''): Promise<string> {
  const row = await queryOne<{ valor: string }>('SELECT valor FROM configuracoes WHERE chave = $1', [chave]);
  return row?.valor ?? fallback;
}

export async function setConfig(chave: string, valor: string): Promise<void> {
  await query(
    'INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
    [chave, valor],
  );
}

// Fee added to each gift's price (editable in the panel; default 5,99% + R$ 0,39)
export async function getTaxa(): Promise<Taxa> {
  const numero = async (chave: string, padrao: number) => {
    const v = Number(await getConfig(chave, String(padrao)));
    return Number.isFinite(v) ? v : padrao;
  };
  return {
    percentual: await numero('taxa_presentes_pct', TAXA_PADRAO.percentual),
    fixoCentavos: await numero('taxa_presentes_fixo', TAXA_PADRAO.fixoCentavos),
  };
}

export async function setTaxa(taxa: Taxa): Promise<void> {
  await setConfig('taxa_presentes_pct', String(Math.round(taxa.percentual * 100) / 100));
  await setConfig('taxa_presentes_fixo', String(Math.round(taxa.fixoCentavos)));
}
