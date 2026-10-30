import type { FastifyInstance } from 'fastify';
import type { AvisoCsp } from '@nv/shared/types';
import { rateLimiter } from '../auth.ts';

// Reports from the browser about what the Content Security Policy (docker/nginx.conf) blocks, or
// would block while it runs in report-only mode. Kept in memory, grouped by directive and source,
// for the couple to review in the panel before the policy is enforced. Nothing personal is kept:
// only the blocked origin (never its path or query) and the site page's path.
const avisos = new Map<string, AvisoCsp>();
const MAX_AVISOS = 200;
const limiter = rateLimiter(60, 60_000);
const desde = new Date().toISOString();

export const avisosCsp = () => ({
  desde,
  avisos: [...avisos.values()].sort((a, b) => b.quantidade - a.quantidade),
});

// "https://x.example/a/b?c" → "https://x.example"; keywords like "inline" or "eval" stay as they are.
function origem(valor: string | undefined): string {
  if (!valor) return 'desconhecido';
  try {
    const url = new URL(valor);
    return url.protocol.startsWith('http') ? url.origin : url.protocol.replace(':', '');
  } catch {
    return valor.slice(0, 40);
  }
}

function caminho(valor: string | undefined): string {
  try {
    return valor ? new URL(valor).pathname.slice(0, 80) : '';
  } catch {
    return '';
  }
}

type Relatorio = Record<string, string | undefined>;

function registrar(r: Relatorio) {
  const diretiva = (r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? r.violatedDirective ?? '?').split(' ')[0];
  const bloqueado = origem(r['blocked-uri'] ?? r.blockedURL ?? r.blockedUri);
  const pagina = caminho(r['document-uri'] ?? r.documentURL ?? r.documentUri);
  const chave = `${diretiva} ${bloqueado}`;
  const atual = avisos.get(chave);
  if (atual) {
    atual.quantidade += 1;
    atual.ultimo = new Date().toISOString();
    atual.pagina = pagina || atual.pagina;
  } else if (avisos.size < MAX_AVISOS) {
    avisos.set(chave, { diretiva, bloqueado, pagina, quantidade: 1, ultimo: new Date().toISOString() });
  }
}

export async function cspRoutes(app: FastifyInstance) {
  // Browsers send "application/csp-report" (report-uri) or "application/reports+json" (Reporting API).
  for (const tipo of ['application/csp-report', 'application/reports+json']) {
    app.addContentTypeParser(tipo, { parseAs: 'string', bodyLimit: 16 * 1024 }, (_req, corpo, done) => {
      try {
        done(null, JSON.parse(corpo as string));
      } catch {
        done(null, null);
      }
    });
  }

  app.post('/csp-relatorio', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    if (!limiter.hit(req.ip)) {
      const corpo = req.body as { 'csp-report'?: Relatorio } | Array<{ body?: Relatorio }> | null;
      if (Array.isArray(corpo)) corpo.slice(0, 20).forEach((r) => r.body && registrar(r.body));
      else if (corpo?.['csp-report']) registrar(corpo['csp-report']);
    }
    return reply.code(204).send();
  });
}
