import { useEffect, useMemo, useRef, useState } from 'react';

const TAMANHOS_PADRAO = [10, 25, 50];

// Client-side pagination: the panel already has the whole list (a wedding has
// at most a few hundred rows), so search, filters and CSV export keep working
// on every item while only one page is rendered.
export function usePaginacao<T>(itens: T[], { porPaginaInicial = 10, reiniciarQuando = [] as unknown[] } = {}) {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(porPaginaInicial);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));

  // Back to page 1 when the search/filter changes.
  useEffect(() => setPagina(1), reiniciarQuando);

  // Stay inside range when items are removed (e.g. deleting the last row of the last page).
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = useMemo(
    () => itens.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina),
    [itens, paginaAtual, porPagina],
  );

  return {
    visiveis,
    pagina: paginaAtual,
    totalPaginas,
    porPagina,
    total: itens.length,
    irPara: setPagina,
    mudarPorPagina: (n: number) => {
      setPorPagina(n);
      setPagina(1);
    },
  };
}

// Page numbers with ellipses: 1 … 4 5 6 … 12
function numeros(pagina: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const meio = [pagina - 1, pagina, pagina + 1].filter((n) => n > 1 && n < total);
  return [1, ...(meio[0] > 2 ? ['…' as const] : []), ...meio, ...(meio[meio.length - 1] < total - 1 ? ['…' as const] : []), total];
}

type Props = ReturnType<typeof usePaginacao<unknown>> & { rotulo?: string; tamanhos?: number[] };

export function Paginacao({
  pagina,
  totalPaginas,
  porPagina,
  total,
  irPara,
  mudarPorPagina,
  rotulo = 'itens',
  tamanhos = TAMANHOS_PADRAO,
}: Props) {
  const topo = useRef<HTMLDivElement>(null);
  if (total === 0) return null;

  const ir = (n: number) => {
    irPara(n);
    // Bring the start of the list back into view after changing page.
    const lista = topo.current?.parentElement?.querySelector('.painel-list');
    lista?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);

  return (
    <div ref={topo} className="painel-paginacao">
      <span className="painel-paginacao__info">
        {inicio}–{fim} de {total} {rotulo}
      </span>

      {totalPaginas > 1 && (
        <nav className="painel-paginacao__nav" aria-label="Paginação">
          <button onClick={() => ir(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior">
            ‹
          </button>
          {numeros(pagina, totalPaginas).map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`} className="painel-paginacao__gap">
                …
              </span>
            ) : (
              <button
                key={n}
                className={n === pagina ? 'is-active' : ''}
                aria-current={n === pagina ? 'page' : undefined}
                aria-label={`Página ${n}`}
                onClick={() => ir(n)}
              >
                {n}
              </button>
            ),
          )}
          <button onClick={() => ir(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página">
            ›
          </button>
        </nav>
      )}

      <label className="painel-paginacao__size">
        Por página
        <select value={porPagina} onChange={(e) => mudarPorPagina(Number(e.target.value))}>
          {tamanhos.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
