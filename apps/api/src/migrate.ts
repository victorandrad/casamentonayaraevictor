import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transaction } from './db.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');
// Any constant works; it keeps two API instances from migrating at once.
const LOCK_ID = 2027_08_28;

// Applies pending migrations/*.sql in name order, all in one transaction.
export async function migrate(log: (msg: string) => void = console.log) {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query<{ nome: string }>('SELECT nome FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.nome));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [file]);
        log(`migration aplicada: ${file}`);
      } catch (error) {
        throw new Error(`falha na migration ${file}: ${(error as Error).message}`);
      }
    }
  });
}
