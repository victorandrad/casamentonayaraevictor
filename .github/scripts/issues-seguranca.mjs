// Issues de segurança de UMA parte do monorepo, a partir do SARIF do OSV-Scanner (etapa security):
//   node .github/scripts/issues-seguranca.mjs <backend|frontend> osv.sarif
//
// Cada pipeline cuida da sua parte: o Backend abre e fecha as issues do backend; o Frontend, as do
// frontend. As ferramentas da raiz (ESLint, build…) são das duas partes: quem rodar primeiro abre (o job
// roda um por vez). Uma vulnerabilidade que afeta backend e frontend vira duas issues.
//   título: "[segurança] <id> · <pacotes> · <parte> · <gravidade>"
//   labels: segurança, dependências, <parte>, produção | só build
// Já aberta: atualiza título e labels. Sumiu da varredura: fecha com um comentário.
// Precisa do gh autenticado (GH_TOKEN) e, para o link no texto, de RUN_URL e GITHUB_SHA.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { origem } from './origem-dependencia.mjs';

// --simular: lê as issues de verdade, mas só mostra o que faria (não cria, edita nem fecha nada).
const simular = process.argv.includes('--simular');
const [parte, arquivo = 'osv.sarif'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!['backend', 'frontend'].includes(parte)) {
  console.error('Uso: node issues-seguranca.mjs <backend|frontend> [osv.sarif] [--simular]');
  process.exit(2);
}
const MINHAS = [parte, 'ferramentas'];
const PARTES = ['backend', 'frontend', 'ferramentas'];
const commit = (process.env.GITHUB_SHA ?? '').slice(0, 7);
const execucao = process.env.RUN_URL ? ` ([execução](${process.env.RUN_URL}))` : '';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const ghMuda = simular
  ? (...args) => {
      console.log(`[simulação] gh ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
      return '(simulação)';
    }
  : gh;

for (const [nome, cor, descricao] of [
  ['segurança', 'B60205', 'Vulnerabilidade encontrada pela etapa security (OSV)'],
  ['dependências', '0366D6', 'Atualização de dependência'],
  ['backend', '5319E7', 'Afeta a API (apps/api)'],
  ['frontend', '1D76DB', 'Afeta o shell, os microfrontends ou o packages/shared'],
  ['ferramentas', 'BFD4F2', 'Ferramenta do monorepo (ESLint, build…)'],
  ['produção', 'D93F0B', 'O pacote vai para o site ou para a API'],
  ['só build', 'C2E0C6', 'Só no build e no desenvolvimento, não vai para produção'],
]) {
  ghMuda('label', 'create', nome, '--color', cor, '--description', descricao, '--force');
}

// ---- O que a varredura achou: id → pacotes, e a regra (gravidade e relatório) ----
const sarif = JSON.parse(readFileSync(arquivo, 'utf8'));
const regras = new Map(sarif.runs.flatMap((r) => r.tool?.driver?.rules ?? []).map((r) => [r.id, r]));
const pacotesPorId = new Map();
for (const r of sarif.runs.flatMap((run) => run.results ?? [])) {
  const pacote = r.message?.text?.match(/Package '([^']+)' is vulnerable/)?.[1];
  if (!pacotesPorId.has(r.ruleId)) pacotesPorId.set(r.ruleId, new Set());
  if (pacote) pacotesPorId.get(r.ruleId).add(pacote);
}

function gravidade(regra) {
  const nota = regra?.properties?.['security-severity'];
  if (!nota) return 'gravidade não informada';
  const n = Number(nota);
  return `${n >= 9 ? 'crítica' : n >= 7 ? 'alta' : n >= 4 ? 'média' : 'baixa'} (${nota})`;
}

// ---- Issues abertas ----
const abertas = JSON.parse(gh('issue', 'list', '--label', 'segurança', '--state', 'open', '--limit', '500', '--json', 'number,title'));
const idDe = (titulo) => titulo.match(/^\[segurança\] (\S+) ·/)?.[1];
const parteDoTitulo = (titulo) => PARTES.find((p) => titulo.includes(` · ${p} · `)) ?? null;
const usadas = new Set(); // números já tratados neste run

const encontradas = new Set(); // "id|parte"
for (const [id, pacotes] of pacotesPorId) {
  const origens = [...pacotes].map(origem);
  const partesDoId = new Set(origens.flatMap((o) => o.partes));
  for (const p of MINHAS.filter((x) => partesDoId.has(x))) {
    encontradas.add(`${id}|${p}`);
    const pacote = [...pacotes].join(', ');
    const producao = origens.some((o) => o.producao[p]);
    const titulo = `[segurança] ${id} · ${pacote} · ${p} · ${gravidade(regras.get(id))}`;
    const labels = ['segurança', 'dependências', p, producao ? 'produção' : 'só build'].join(',');

    // A desta parte; ou uma de antes da separação por parte (sem a parte no título), que passa a ser desta.
    const existente =
      abertas.find((i) => idDe(i.title) === id && parteDoTitulo(i.title) === p) ??
      abertas.find((i) => idDe(i.title) === id && parteDoTitulo(i.title) === null && !usadas.has(i.number));
    if (existente) {
      usadas.add(existente.number);
      ghMuda('issue', 'edit', String(existente.number), '--title', titulo, '--add-label', labels);
      console.log(`${id} (${p}): issue #${existente.number} atualizada`);
      continue;
    }

    const regra = regras.get(id);
    const corpo = [
      `**Pacote:** \`${pacote}\``,
      `**Parte:** ${p}`,
      `**Vai para produção?** ${producao ? '**sim**: o pacote vai para o site ou para a API' : 'não: só no build e no desenvolvimento'}`,
      `**Gravidade:** ${gravidade(regra)}`,
      `**Onde:** \`package-lock.json\` · encontrada no commit ${commit}${execucao}`,
      '',
      '### Quem usa',
      '',
      '```',
      origens.map((o) => o.arvore).join('\n\n'),
      '```',
      '',
      '---',
      '',
      (regra?.help?.markdown ?? regra?.fullDescription?.text ?? '').slice(0, 60000),
      '',
      '---',
      '_Aberta automaticamente pela etapa **security** (OSV-Scanner) do pipeline ' +
        `${p === 'ferramentas' ? 'que rodou primeiro' : p === 'backend' ? 'Backend' : 'Frontend'}. ` +
        'Ela fecha sozinha quando a vulnerabilidade sumir da varredura, por exemplo depois de atualizar a dependência._',
    ].join('\n');
    writeFileSync('corpo.md', corpo);
    const url = ghMuda('issue', 'create', '--title', titulo, '--label', labels, '--body-file', 'corpo.md').trim();
    console.log(`${id} (${p}): aberta ${url}`);
  }
}

// ---- Fecha as desta parte que sumiram da varredura (e as antigas, sem parte, cuja vulnerabilidade sumiu) ----
for (const i of abertas) {
  if (usadas.has(i.number)) continue;
  const id = idDe(i.title);
  const p = parteDoTitulo(i.title);
  if (!id) continue;
  const resolvida = p === null ? !pacotesPorId.has(id) : MINHAS.includes(p) && !encontradas.has(`${id}|${p}`);
  if (!resolvida) continue;
  ghMuda(
    'issue', 'close', String(i.number), '--reason', 'completed', '--comment',
    `Não aparece mais na varredura do commit ${commit}${execucao}: a dependência foi atualizada ou a vulnerabilidade saiu da base. ✅`,
  );
  console.log(`${id}${p ? ` (${p})` : ''}: issue #${i.number} fechada`);
}
