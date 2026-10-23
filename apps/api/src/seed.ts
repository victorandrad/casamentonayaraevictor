// Seeds the database: creates/updates the couple's login from ADMIN_* env vars
// and, outside production, fills empty tables with the example content from the design.
//   docker compose exec api node src/seed.ts      (inside Docker)
//   npm run seed -w @nv/api                       (from the host)
import { hashPassword, verifyPassword } from './auth.ts';
import { pool, query, queryOne } from './db.ts';
import { migrate } from './migrate.ts';
import * as repo from './repo.ts';
import { sincronizarCaixaDoPainel } from './emails.ts';

// Keyed by category name (the categories come from migration 007).
const presentes = {
  'Chá-Bar': [
    ['Espumante Brut', 90],
    ['Gin importado', 180],
    ['Vinho tinto reserva', 120],
    ['Whisky 12 anos', 260],
    ['Cachaça artesanal', 70],
    ['Espumante rosé', 95],
    ['Vodka premium', 150],
    ['Kit de licores', 80],
  ],
  'Para o nosso lar': [
    ['Jogo de panelas', 400],
    ['Taças de cristal', 220],
    ['Cafeteira', 350],
    ['Aparelho de jantar', 500],
    ['Cota lua de mel', 200],
    ['Roupa de cama premium', 300],
    ['Air fryer', 450],
    ['Jogo de facas', 180],
  ],
} as const;

const convidados = [
  ['Maria & João Silva', 1],
  ['Família Oliveira', 3],
  ['Ana Beatriz Souza', 0],
  ['Carlos e Fernanda', 1],
  ['Tia Lúcia', 0],
] as const;

const recados = [
  ['Tia Lúcia', 'Que a vida de vocês seja repleta de amor e cumplicidade. Felicidades!'],
  ['Marcos & Bia', 'Contamos os dias para celebrar com vocês. Amamos muito!'],
] as const;

const isEmpty = async (table: string) => !(await queryOne(`SELECT 1 FROM ${table} LIMIT 1`));

// Creates the panel owner from ADMIN_EMAIL/ADMIN_PASSWORD. Afterwards the password (and name) can be
// changed in the panel ("Minha conta"): the secret is applied again only when it changes, so a deploy
// never undoes a change made there. A scrypt hash of the last applied secret is kept to tell.
const CHAVE_SENHA_APLICADA = 'admin_senha_aplicada';

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const nome = process.env.ADMIN_NOME?.trim() || 'Noivos';
  if (!email || !password) {
    console.log('ADMIN_EMAIL/ADMIN_PASSWORD não definidos: nenhuma conta criada.');
    return;
  }
  if (password.length < 10) throw new Error('ADMIN_PASSWORD precisa ter pelo menos 10 caracteres.');

  const existe = await queryOne<{ id: number }>('SELECT id FROM usuarios WHERE email = $1', [email]);
  const aplicada = await repo.getConfig(CHAVE_SENHA_APLICADA);
  const secretNovo = !aplicada || !(await verifyPassword(password, aplicada));

  if (!existe) {
    await query('INSERT INTO usuarios (email, nome, senha_hash) VALUES ($1, $2, $3)', [email, nome, await hashPassword(password)]);
    console.log(`Conta do painel criada: ${email}`);
  } else if (secretNovo) {
    await query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [existe.id, await hashPassword(password)]);
    console.log(`Conta do painel: senha do ADMIN_PASSWORD aplicada (${email})`);
  } else {
    console.log(`Conta do painel pronta: ${email} (senha mantida)`);
  }

  if (!existe || secretNovo) {
    await repo.setConfig(CHAVE_SENHA_APLICADA, await hashPassword(password));
    // Same password for the mailbox with this address (when it is on the mail server's domain).
    const caixa = await sincronizarCaixaDoPainel(password);
    if (caixa !== 'ignorada') console.log(`Caixa de e-mail ${email}: ${caixa}`);
  }
}

async function seedContent() {
  if (await isEmpty('presentes')) {
    const categorias = await repo.listCategorias();
    for (const [categoria, itens] of Object.entries(presentes)) {
      const categoriaId =
        categorias.find((c) => c.nome === categoria)?.id ?? (await repo.createCategoria({ nome: categoria, icone: 'gift' })).id;
      for (const [nome, reais] of itens) {
        await repo.createPresente({
          categoriaId,
          nome,
          valorCentavos: reais * 100,
          fotoUrl: null,
          quantidadeMaxima: nome.startsWith('Cota') ? null : 1,
        });
      }
    }
    console.log('Presentes de exemplo criados.');
  }
  if (await isEmpty('convidados')) {
    for (const [nome, limite] of convidados) await repo.createConvidado({ nome, limiteAcompanhantes: limite });
    console.log('Convidados de exemplo criados.');
  }
  if (await isEmpty('recados')) {
    for (const [nome, mensagem] of recados) await repo.createRecado(nome, mensagem);
    console.log('Recados de exemplo criados.');
  }
}

try {
  await migrate();
  await seedAdmin();
  // Production only gets the login: the couple fill in the real content.
  if (process.env.NODE_ENV !== 'production') await seedContent();
} finally {
  await pool.end();
}
