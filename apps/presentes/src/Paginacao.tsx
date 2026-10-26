export const POR_PAGINA = 12;

// Category and page live in the URL (?categoria=2&pagina=3) so a reload or a
// shared link opens the same page. Defaults (all categories, page 1) are left out.
export type Filtro = { categoria: number | null; pagina: number };

export function lerFiltroDaUrl(): Filtro {
  const params = new URLSearchParams(location.search);
  const categoria = Number(params.get('categoria'));
  const pagina = Math.floor(Number(params.get('pagina')));
  return {
    categoria: Number.isInteger(categoria) && categoria > 0 ? categoria : null,
    pagina: pagina > 1 ? pagina : 1,
  };
}

export function gravarFiltroNaUrl({ categoria, pagina }: Filtro) {
  const url = new URL(location.href);
  if (categoria) url.searchParams.set('categoria', String(categoria));
  else url.searchParams.delete('categoria');
  if (pagina > 1) url.searchParams.set('pagina', String(pagina));
  else url.searchParams.delete('pagina');
  const destino = url.pathname + url.search + url.hash;
  if (destino !== location.pathname + location.search + location.hash) history.replaceState(null, '', destino);
}

// Page numbers with ellipses: 1 … 4 5 6 … 12
function numeros(pagina: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const meio = [pagina - 1, pagina, pagina + 1].filter((n) => n > 1 && n < total);
  return [1, ...(meio[0] > 2 ? ['…' as const] : []), ...meio, ...(meio[meio.length - 1] < total - 1 ? ['…' as const] : []), total];
}

type Props = { pagina: number; totalPaginas: number; total: number; onPagina: (n: number) => void };

export function Paginacao({ pagina, totalPaginas, total, onPagina }: Props) {
  if (totalPaginas <= 1) return null;
  const inicio = (pagina - 1) * POR_PAGINA + 1;
  const fim = Math.min(pagina * POR_PAGINA, total);

  return (
    <nav className="presentes-paginacao" aria-label="Páginas da lista de presentes">
      <div className="presentes-paginacao__nav">
        <button onClick={() => onPagina(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior">
          ‹
        </button>
        {numeros(pagina, totalPaginas).map((n, i) =>
          n === '…' ? (
            <span key={`e${i}`} className="presentes-paginacao__gap">
              …
            </span>
          ) : (
            <button
              key={n}
              className={n === pagina ? 'is-active' : ''}
              aria-current={n === pagina ? 'page' : undefined}
              aria-label={`Página ${n}`}
              onClick={() => onPagina(n)}
            >
              {n}
            </button>
          ),
        )}
        <button onClick={() => onPagina(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página">
          ›
        </button>
      </div>
      <span className="presentes-paginacao__info">
        {inicio}–{fim} de {total} presentes
      </span>
    </nav>
  );
}
