// De onde vem um pacote do monorepo (usado nas issues de segurança):
//   node .github/scripts/origem-dependencia.mjs vite@7.3.6
//   → {"partes":["frontend"],"producao":{"backend":false,"frontend":false,"ferramentas":false},"arvore":"…npm ls…"}
// partes: backend (apps/api), frontend (shell, microfrontends e packages/shared) ou ferramentas (dependências
// da raiz, como o ESLint). producao[parte]: aparece mesmo sem as devDependencies (vai para o site ou para a
// API); senão é só de build e desenvolvimento. Precisa do node_modules instalado na raiz.
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MONOREPO = fileURLToPath(new URL('../../', import.meta.url));

// npm ls sai com erro quando a árvore tem algo "invalid"/"extraneous", mas a saída continua válida.
function npmLs(spec, extra) {
  try {
    // No Windows o npm é npm.cmd (só para testar localmente; o CI roda no Linux).
    return execFileSync('npm', ['ls', spec, '--all', ...extra], {
      cwd: MONOREPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    });
  } catch (err) {
    return err.stdout ?? '';
  }
}
const arvoreJson = (spec, extra = []) => JSON.parse(npmLs(spec, ['--json', ...extra]) || '{}').dependencies ?? {};

// Workspaces com escopo (@nv/api) aparecem como file:../../apps/api; sem escopo, file:../apps/api.
const parteDe = (dep) => {
  const caminho = (dep.resolved ?? '').replace(/^file:(\.\.\/)+/, '');
  if (caminho === 'apps/api') return 'backend';
  if (caminho.startsWith('apps/') || caminho.startsWith('packages/')) return 'frontend';
  return 'ferramentas';
};

export function origem(spec) {
  const partes = [...new Set(Object.values(arvoreJson(spec)).map(parteDe))].sort();
  const producao = { backend: false, frontend: false, ferramentas: false };
  for (const dep of Object.values(arvoreJson(spec, ['--omit=dev']))) producao[parteDe(dep)] = true;
  const arvore = npmLs(spec, []).trim().split('\n').slice(0, 40).join('\n');
  return { partes: partes.length ? partes : ['ferramentas'], producao, arvore };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error('Uso: node origem-dependencia.mjs <pacote@versão>');
    process.exit(2);
  }
  console.log(JSON.stringify(origem(process.argv[2])));
}
