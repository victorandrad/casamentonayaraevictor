import { useCallback, useEffect, useRef, useState } from 'react';
import { EstadoVazio, Icon, navegar, Placeholder, SectionHeader, type IconName } from '@nv/shared';
import { errorMessage, formatBRL } from '@nv/shared/api';
import { iconeDaCategoria } from '@nv/shared/categorias';
import type { ListaPresentes, Presente } from '@nv/shared/types';
import { useCarrinho } from './carrinho';
import { buscarLista } from './lista';
import { pedidoEmAberto } from './pagamento';
import { Paginacao, POR_PAGINA, gravarFiltroNaUrl, lerFiltroDaUrl, type Filtro } from './Paginacao';
import './presentes.css';

type GridProps = {
  icon: IconName;
  titulo: string;
  gifts: Presente[];
  noCarrinho: (id: string) => number;
  recemAdicionado: string | null;
  onAdicionar: (g: Presente) => void;
};

function GiftGrid({ icon, titulo, gifts, noCarrinho, recemAdicionado, onAdicionar }: GridProps) {
  return (
    <>
      <h3 className="presentes-group">
        <Icon name={icon} size={26} />
        <span className="nv-italic">{titulo}</span>
      </h3>
      <div className="presentes-grid">
        {gifts.map((gift) => {
          const qtd = noCarrinho(gift.id);
          const esgotado = gift.disponivel === 0;
          const cota = gift.quantidadeMaxima === null;
          const noLimite = gift.disponivel !== null && qtd >= gift.disponivel;
          const classes = ['presentes-card', 'nv-reveal', qtd ? 'is-selected' : '', esgotado ? 'is-presenteado' : ''].join(' ');
          return (
            <div key={gift.id} className={classes}>
              {esgotado ? (
                <span className="presentes-card__badge presentes-card__badge--presenteado">Presenteado ♥</span>
              ) : (
                qtd > 0 && <span className="presentes-card__badge">{qtd > 1 ? `${qtd}× no carrinho` : 'No carrinho'}</span>
              )}
              {cota && !qtd && <span className="presentes-card__tag">Cota</span>}
              {gift.fotoUrl ? (
                <img className="presentes-card__photo" src={gift.fotoUrl} alt={gift.nome} loading="lazy" />
              ) : (
                <Placeholder className="presentes-card__photo" label="foto do item" />
              )}
              <h4 className="presentes-card__name">{gift.nome}</h4>
              <p className="presentes-card__price">{formatBRL(gift.valorCentavos)}</p>
              {cota && <p className="presentes-card__nota">Contribua quantas vezes quiser</p>}
              {!cota && gift.quantidadeMaxima! > 1 && !esgotado && (
                <p className="presentes-card__nota">
                  {gift.disponivel === 1 ? 'Resta 1' : `Restam ${gift.disponivel}`}
                </p>
              )}
              <button
                className={recemAdicionado === gift.id ? 'nv-btn-outline presentes-card__cta is-added' : 'nv-btn-outline presentes-card__cta'}
                onClick={() => onAdicionar(gift)}
                disabled={esgotado || noLimite}
              >
                {esgotado
                  ? 'Já presenteado'
                  : recemAdicionado === gift.id
                    ? '✓ Adicionado'
                    : noLimite
                      ? '✓ No carrinho'
                      : qtd
                        ? cota
                          ? 'Contribuir mais uma vez'
                          : 'Adicionar mais um'
                        : cota
                          ? 'Contribuir'
                          : 'Presentear'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function Presentes() {
  const [lista, setLista] = useState<ListaPresentes | null>(null);
  const [erro, setErro] = useState('');
  const [recemAdicionado, setRecemAdicionado] = useState<string | null>(null);
  // A Pix (or a payment being confirmed) from an earlier visit: a note points to its page.
  const [pedidoAberto] = useState(pedidoEmAberto);
  const [filtro, setFiltro] = useState<Filtro>(lerFiltroDaUrl);
  const topoDaLista = useRef<HTMLDivElement>(null);
  const carrinho = useCarrinho();

  const carregarLista = useCallback(async () => {
    try {
      const comTaxa = await buscarLista();
      setLista(comTaxa);
      carrinho.dispatch({ tipo: 'sincronizar', presentes: comTaxa.presentes });
    } catch (error) {
      setErro(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  const adicionar = (presente: Presente) => {
    carrinho.dispatch({ tipo: 'adicionar', presente });
    setRecemAdicionado(presente.id);
    setTimeout(() => setRecemAdicionado((id) => (id === presente.id ? null : id)), 1400);
  };

  const noCarrinho = (id: string) => carrinho.itens.find((i) => i.id === id)?.quantidade ?? 0;

  // Client-side pagination: the cart syncs against the whole list, and a wedding
  // list has at most a few hundred gifts, so it all comes in one request.
  const comPresentes = lista ? lista.categorias.filter((c) => lista.presentes.some((p) => p.categoriaId === c.id)) : [];
  // A category from an old link that no longer has gifts falls back to "all".
  const categoria = comPresentes.some((c) => c.id === filtro.categoria) ? filtro.categoria : null;
  const filtrados = lista ? lista.presentes.filter((p) => categoria === null || p.categoriaId === categoria) : [];
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pagina = Math.min(filtro.pagina, totalPaginas);
  const visiveis = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // Once the list is in, keep the URL on the page actually shown (out-of-range pages are clamped).
  useEffect(() => {
    if (lista) gravarFiltroNaUrl({ categoria, pagina });
  }, [lista, categoria, pagina]);

  const irParaPagina = (n: number) => {
    setFiltro({ categoria, pagina: n });
    topoDaLista.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Changing category always starts again at page 1.
  const escolherCategoria = (id: number | null) => setFiltro({ categoria: id, pagina: 1 });

  return (
    <section id="presentes" className="nv-section">
      <div className="nv-container--wide">
        <SectionHeader eyebrow="Lista de presentes" title="Nos ajude a começar">
          <p className="nv-lead">
            Sua presença é o nosso maior presente. Mas, se quiser nos presentear, escolha um ou mais itens abaixo e
            finalize quando quiser.
          </p>
          <p className="presentes-nota">Os valores já incluem a taxa de processamento do pagamento.</p>
        </SectionHeader>
        {!lista && !erro && <p className="presentes-status">Carregando a lista…</p>}
        {!lista && erro && (
          <EstadoVazio
            icon="gift"
            titulo="Não conseguimos carregar a lista agora"
            acao={
              <button
                className="nv-btn-outline"
                onClick={() => {
                  setErro('');
                  carregarLista();
                }}
              >
                Tentar novamente
              </button>
            }
          >
            Verifique sua conexão e tente de novo em instantes.
          </EstadoVazio>
        )}
        {lista && lista.presentes.length === 0 && (
          <EstadoVazio icon="gift" titulo="Nossa lista está sendo preparada">
            Em breve os presentes estarão aqui. Enquanto isso, o que mais importa é a sua presença no nosso dia. ♥
          </EstadoVazio>
        )}
        {/* Where a page change scrolls back to: the filters, then the gifts. */}
        <div ref={topoDaLista} className="presentes-topo" />
        {lista && comPresentes.length > 1 && (
          <div className="presentes-filtros" role="group" aria-label="Filtrar por categoria">
            <button className={categoria === null ? 'presentes-filtro is-active' : 'presentes-filtro'} aria-pressed={categoria === null} onClick={() => escolherCategoria(null)}>
              Todos
            </button>
            {comPresentes.map((c) => (
              <button
                key={c.id}
                className={categoria === c.id ? 'presentes-filtro is-active' : 'presentes-filtro'}
                aria-pressed={categoria === c.id}
                onClick={() => escolherCategoria(c.id)}
              >
                <Icon name={iconeDaCategoria(c.icone)} size={16} />
                {c.nome}
              </button>
            ))}
          </div>
        )}
        {lista &&
          // Categories come in the couple's order; those with nothing on this page are skipped.
          lista.categorias.map((c) => {
            const gifts = visiveis.filter((p) => p.categoriaId === c.id);
            return gifts.length ? (
              <GiftGrid
                key={c.id}
                icon={iconeDaCategoria(c.icone)}
                titulo={c.nome}
                gifts={gifts}
                noCarrinho={noCarrinho}
                recemAdicionado={recemAdicionado}
                onAdicionar={adicionar}
              />
            ) : null;
          })}
        <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={filtrados.length} onPagina={irParaPagina} />
      </div>

      {pedidoAberto && (
        <button className="presentes-pedido-aberto" onClick={() => navegar(`/presentear/pedido/${pedidoAberto}`)}>
          <Icon name="clock" size={18} />
          <span>
            <strong>Você tem um pagamento em andamento</strong>
            <small>Ver o Pix ou a confirmação →</small>
          </span>
        </button>
      )}

      {/* The checkout is its own pages (/presentear): cart, details, payment. */}
      {carrinho.quantidade > 0 && (
        <button
          key={carrinho.quantidade}
          className="presentes-cart-fab"
          onClick={() => navegar('/presentear')}
          aria-label={`Ver carrinho: ${carrinho.quantidade} presente(s), ${formatBRL(carrinho.total)}`}
        >
          <span className="presentes-cart-fab__icon">
            <Icon name="gift" size={22} />
            <span className="presentes-cart-fab__count">{carrinho.quantidade}</span>
          </span>
          <span className="presentes-cart-fab__text">
            <small>Seus presentes</small>
            <strong>{formatBRL(carrinho.total)}</strong>
          </span>
          <span className="presentes-cart-fab__cta">Finalizar →</span>
        </button>
      )}

    </section>
  );
}
