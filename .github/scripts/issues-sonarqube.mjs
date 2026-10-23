// Issues do GitHub a partir da análise do SonarQube Community Build (etapa code-analyzing, job
// sonarqube-check), para UMA parte do monorepo:
//   node .github/scripts/issues-sonarqube.mjs <backend|frontend> <projectKey> [--simular]
//
// Viram issue: problemas que afetam segurança ou confiabilidade (de qualquer gravidade, menos "info") e
// de manutenção com gravidade alta ou bloqueante. Uma issue por regra e arquivo, com todas as linhas.
// A identidade fica num comentário escondido no corpo (<!-- sonarqube:parte|regra|arquivo -->): o servidor
// do SonarQube é temporário (sobe a cada execução), então as chaves dele mudam e não servem para isso.
// Já aberta: atualiza título e corpo quando o conteúdo muda. Sumiu da análise: fecha com um comentário. No máximo NOVAS_POR_VEZ
// issues novas por execução (o resto entra nas próximas).
// Ambiente: SONAR_HOST_URL, SONAR_TOKEN, GH_TOKEN; para os links: GITHUB_REPOSITORY, GITHUB_SHA, RUN_URL.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';

const NOVAS_POR_VEZ = 30;
const simular = process.argv.includes('--simular');
const [parte, projeto] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!['backend', 'frontend'].includes(parte) || !projeto) {
  console.error('Uso: node issues-sonarqube.mjs <backend|frontend> <projectKey> [--simular]');
  process.exit(2);
}
const SONAR = (process.env.SONAR_HOST_URL ?? 'http://localhost:9000').replace(/\/$/, '');
const repo = process.env.GITHUB_REPOSITORY ?? 'victorandrad/casamentonayaraevictor';
const sha = process.env.GITHUB_SHA ?? 'main';
const execucao = process.env.RUN_URL ? ` ([execução](${process.env.RUN_URL}))` : '';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const ghMuda = simular
  ? (...args) => {
      console.log(`[simulação] gh ${args.slice(0, 4).join(' ')} …`);
      return '(simulação)';
    }
  : gh;

const QUALIDADE = { SECURITY: 'segurança', RELIABILITY: 'confiabilidade', MAINTAINABILITY: 'manutenção' };
const GRAVIDADE = { BLOCKER: 'bloqueante', HIGH: 'alta', MEDIUM: 'média', LOW: 'baixa', INFO: 'info' };
const PESO = { BLOCKER: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };

const relevante = (impacto) =>
  impacto.softwareQuality === 'MAINTAINABILITY'
    ? ['HIGH', 'BLOCKER'].includes(impacto.severity)
    : impacto.severity !== 'INFO';

// ---- Problemas abertos no SonarQube (paginado) ----
async function sonar(caminho) {
  const r = await fetch(`${SONAR}${caminho}`, { headers: { Authorization: `Bearer ${process.env.SONAR_TOKEN}` } });
  if (!r.ok) throw new Error(`SonarQube ${r.status} em ${caminho}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
const problemas = [];
const nomesDasRegras = new Map();
for (let p = 1; p <= 20; p++) {
  const j = await sonar(
    `/api/issues/search?components=${encodeURIComponent(projeto)}&issueStatuses=OPEN,CONFIRMED&additionalFields=rules&ps=500&p=${p}`,
  );
  problemas.push(...j.issues);
  for (const r of j.rules ?? []) nomesDasRegras.set(r.key, r.name);
  if (p * 500 >= j.paging.total) break;
}

// ---- Agrupa por regra e arquivo ----
const grupos = new Map();
for (const i of problemas) {
  const impactos = (i.impacts ?? []).filter(relevante);
  if (!impactos.length) continue;
  const arquivo = i.component.split(':').slice(1).join(':');
  const chave = `${parte}|${i.rule}|${arquivo}`;
  if (!grupos.has(chave)) grupos.set(chave, { regra: i.rule, arquivo, ocorrencias: [], impactos: new Map() });
  const g = grupos.get(chave);
  g.ocorrencias.push({ linha: i.line ?? null, mensagem: i.message });
  for (const imp of impactos) {
    const atual = g.impactos.get(imp.softwareQuality);
    if (!atual || PESO[imp.severity] > PESO[atual]) g.impactos.set(imp.softwareQuality, imp.severity);
  }
}

const linkRegra = (regra) => {
  const [lang, id] = regra.split(':');
  return /^S\d+$/.test(id ?? '') ? `https://rules.sonarsource.com/${lang}/RSPEC-${id.slice(1)}/` : null;
};
const linkLinha = (arquivo, linha) => `https://github.com/${repo}/blob/${sha}/${arquivo}${linha ? `#L${linha}` : ''}`;

function montar(chave, g) {
  const [qualidade, gravidade] = [...g.impactos].sort((a, b) => PESO[b[1]] - PESO[a[1]])[0];
  const nome = (nomesDasRegras.get(g.regra) ?? g.regra).slice(0, 110);
  const curto = g.arquivo;
  const ocorr = [...g.ocorrencias].sort((a, b) => (a.linha ?? 0) - (b.linha ?? 0));
  const titulo = `[sonarqube] ${nome} · ${curto} · ${parte}`;
  const labels = ['sonarqube', 'qualidade', parte, ...[...g.impactos.keys()].map((q) => `sonar: ${QUALIDADE[q]}`)];
  const regra = linkRegra(g.regra);
  // O que importa para atualizar a issue (o commit e os links mudam a cada push e não contam).
  const assinatura = createHash('sha1').update(JSON.stringify([titulo, labels, ocorr])).digest('hex').slice(0, 12);
  const corpo = [
    `<!-- sonarqube:${chave} -->`,
    `<!-- sonarqube-assinatura:${assinatura} -->`,
    `**Regra:** ${regra ? `[\`${g.regra}\`](${regra})` : `\`${g.regra}\``} — ${nome}`,
    `**Afeta:** ${[...g.impactos].map(([q, s]) => `${QUALIDADE[q]} (${GRAVIDADE[s]})`).join(', ')}`,
    `**Parte:** ${parte}`,
    `**Arquivo:** [\`${g.arquivo}\`](${linkLinha(g.arquivo)}) · ${ocorr.length} ocorrência(s) · análise do commit ${sha.slice(0, 7)}${execucao}`,
    '',
    '| Linha | O que o SonarQube diz |',
    '|---|---|',
    ...ocorr.slice(0, 100).map((o) => `| ${o.linha ? `[${o.linha}](${linkLinha(g.arquivo, o.linha)})` : '—'} | ${o.mensagem.replace(/\|/g, '\\|')} |`),
    ocorr.length > 100 ? `\n…e mais ${ocorr.length - 100}.` : '',
    '',
    '---',
    `_Aberta automaticamente pelo job **sonarqube-check** (SonarQube Community Build) do pipeline ${parte === 'backend' ? 'Backend' : 'Frontend'}. ` +
      'É atualizada a cada análise e fecha sozinha quando o problema sumir do código._',
  ].join('\n');
  return { titulo, labels, corpo, qualidade, gravidade, assinatura };
}

// ---- Issues no GitHub ----
for (const [nome, cor, descricao] of [
  ['sonarqube', '4E9BCD', 'Encontrado pela análise do SonarQube'],
  ['qualidade', 'FBCA04', 'Qualidade de código'],
  ['backend', '5319E7', 'Afeta a API (apps/api)'],
  ['frontend', '1D76DB', 'Afeta o shell, os microfrontends ou o packages/shared'],
  ['sonar: segurança', 'B60205', 'SonarQube: afeta a segurança'],
  ['sonar: confiabilidade', 'D93F0B', 'SonarQube: bug ou comportamento errado'],
  ['sonar: manutenção', 'C5DEF5', 'SonarQube: código difícil de manter'],
]) {
  ghMuda('label', 'create', nome, '--color', cor, '--description', descricao, '--force');
}
const abertas = JSON.parse(gh('issue', 'list', '--label', 'sonarqube', '--state', 'open', '--limit', '500', '--json', 'number,title,body'));
const chaveDe = (corpo) => corpo?.match(/<!-- sonarqube:(.+?) -->/)?.[1] ?? null;
const porChave = new Map(abertas.map((i) => [chaveDe(i.body), i]).filter(([k]) => k));

// Mais graves primeiro (é a ordem em que as novas são abertas, até o limite).
const ordenados = [...grupos].map(([chave, g]) => [chave, montar(chave, g)]).sort((a, b) => PESO[b[1].gravidade] - PESO[a[1].gravidade]);
let novas = 0;
let atualizadas = 0;
let adiadas = 0;
for (const [chave, m] of ordenados) {
  const existente = porChave.get(chave);
  writeFileSync('corpo.md', m.corpo);
  if (existente) {
    if (!existente.body?.includes(`<!-- sonarqube-assinatura:${m.assinatura} -->`)) {
      ghMuda('issue', 'edit', String(existente.number), '--title', m.titulo, '--body-file', 'corpo.md', '--add-label', m.labels.join(','));
      atualizadas++;
    }
    continue;
  }
  if (novas >= NOVAS_POR_VEZ) {
    adiadas++;
    continue;
  }
  const url = ghMuda('issue', 'create', '--title', m.titulo, '--label', m.labels.join(','), '--body-file', 'corpo.md').trim();
  console.log(`aberta: ${m.titulo} ${url}`);
  novas++;
}

// Fecha as desta parte que sumiram da análise.
let fechadas = 0;
for (const [chave, i] of porChave) {
  if (!chave.startsWith(`${parte}|`) || grupos.has(chave)) continue;
  ghMuda(
    'issue', 'close', String(i.number), '--reason', 'completed', '--comment',
    `Não aparece mais na análise do SonarQube do commit ${sha.slice(0, 7)}${execucao}. ✅`,
  );
  fechadas++;
}

const resumo = [
  `## 🧹 SonarQube (${parte})`,
  `${problemas.length} problema(s) abertos na análise; ${grupos.size} grupo(s) relevantes (regra + arquivo) viram issue.`,
  '',
  `- novas: **${novas}**${adiadas ? ` (mais ${adiadas} na próxima execução — limite de ${NOVAS_POR_VEZ} por vez)` : ''}`,
  `- atualizadas: ${atualizadas}`,
  `- fechadas (resolvidas): ${fechadas}`,
].join('\n');
console.log(resumo);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${resumo}\n`);
