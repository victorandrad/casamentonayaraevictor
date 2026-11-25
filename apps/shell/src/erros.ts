// Front-end error monitoring: errors from the shell and every micro-frontend (they all run on this
// page) go to our own Bugsink at erros.casamentonayaraevictor.com.br, which speaks the Sentry
// protocol. Only on the real site, so local development never reports.
//
// The SDK is loaded in its own chunk after the page starts, so it never delays the first paint; errors
// reported before it arrives wait in a short queue. The DSN is public by design: it only lets the
// browser send errors to that one project.
const DSN = 'https://486bab3048cc4d939dec14b542e61d7d@erros.casamentonayaraevictor.com.br/1';
const SITE = 'casamentonayaraevictor.com.br';

// Invite codes (NV-XXXX) open the guest's invite, the reception address and the check-in: they never
// leave the browser in a report. The URL's hash and query (#convite=…, ?pedido=…) are dropped too.
const CODIGO = /NV-[A-Z0-9]{4,}/gi;
const limpar = (texto: string) => texto.replace(CODIGO, 'NV-****');
const limparUrl = (url: string) => limpar(url.replace(/[?#].*$/, ''));

type Sentry = typeof import('./erros-sdk');
let sentry: Sentry | null = null;
const fila: Array<[unknown, Record<string, string> | undefined]> = [];

export function monitorarErros() {
  if (!DSN || location.hostname !== SITE) return;
  void import('./erros-sdk').then((s) => {
    iniciar(s);
    sentry = s;
    for (const [erro, contexto] of fila.splice(0)) reportarErro(erro, contexto);
  });
}

function iniciar(Sentry: Sentry) {
  Sentry.init({
    dsn: DSN,
    environment: 'producao',
    // No user info, cookies, headers, bodies or query params; no tracing or session replay: errors only.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
    // Only errors from our own scripts; browser extensions and third-party scripts are not ours to fix.
    allowUrls: [/casamentonayaraevictor\.com\.br/],
    ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured'],
    beforeBreadcrumb(crumb) {
      if (typeof crumb.data?.url === 'string') crumb.data.url = limparUrl(crumb.data.url);
      if (typeof crumb.data?.to === 'string') crumb.data.to = limparUrl(crumb.data.to);
      if (typeof crumb.data?.from === 'string') crumb.data.from = limparUrl(crumb.data.from);
      if (crumb.message) crumb.message = limpar(crumb.message);
      return crumb;
    },
    beforeSend(event) {
      // No user at all, so the server can't fill in the visitor's IP either.
      delete event.user;
      if (event.request?.url) event.request.url = limparUrl(event.request.url);
      if (event.request) {
        delete event.request.query_string;
        delete event.request.cookies;
      }
      if (event.message) event.message = limpar(event.message);
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = limpar(ex.value);
      }
      return event;
    },
  });
}

// For React's own error callbacks and the micro-frontend error boundary.
export function reportarErro(erro: unknown, contexto?: Record<string, string>) {
  if (!sentry) {
    if (fila.length < 20) fila.push([erro, contexto]);
    return;
  }
  sentry.captureException(erro, contexto ? { tags: contexto } : undefined);
}
