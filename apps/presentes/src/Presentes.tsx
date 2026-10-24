import { useCallback, useEffect, useState } from 'react';
import { EstadoVazio, Icon, Placeholder, SectionHeader, type IconName } from '@nv/shared';
import { api, errorMessage, formatBRL } from '@nv/shared/api';
import { precoComTaxa } from '@nv/shared/taxas';
import { iconeDaCategoria } from '@nv/shared/categorias';
import type { ListaPresentes, Presente } from '@nv/shared/types';
import { useCarrinho } from './carrinho';
import { Checkout } from './Checkout';
import { cancelarPagamentoPendente, lerRetornoDoStripe, limparRetornoDaUrl } from './pagamento';
import { RetornoPagamento } from './RetornoPagamento';
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
  const [checkoutAberto, setCheckoutAberto] = useState(false);
  const [recemAdicionado, setRecemAdicionado] = useState<string | null>(null);
  const [retorno] = useState(lerRetornoDoStripe);
  const [retornoAberto, setRetornoAberto] = useState(retorno?.tipo === 'sucesso');
  const [avisoCancelado, setAvisoCancelado] = useState(retorno?.tipo === 'cancelado');
  const carrinho = useCarrinho();

  // Coming back from Stripe: drop ?pedido from the URL so a reload doesn't repeat it.
  useEffect(() => {
    if (retorno) limparRetornoDaUrl();
    if (retorno?.tipo !== 'cancelado') return;
    const timer = setTimeout(() => setAvisoCancelado(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  const carregarLista = useCallback(async () => {
    try {
      const data = await api<ListaPresentes>('/public/presentes');
      // Guests see each gift with the payment fee already included; the API
      // charges the same price using the same rule.
      const comTaxa = {
        ...data,
        presentes: data.presentes.map((p) => ({ ...p, valorCentavos: precoComTaxa(p.valorCentavos, data.taxa) })),
      };
      setLista(comTaxa);
      carrinho.dispatch({ tipo: 'sincronizar', presentes: comTaxa.presentes });
    } catch (error) {
      setErro(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    // A checkout left unpaid (cancelled or abandoned) still reserves its gifts:
    // release it first so the list shows them as available again.
    cancelarPagamentoPendente(retorno?.tipo === 'sucesso' ? retorno.pedido : undefined).finally(carregarLista);

    // Back button from Stripe restores this page from cache: same thing.
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      cancelarPagamentoPendente().then((cancelou) => {
        if (cancelou) carregarLista();
      });
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const adicionar = (presente: Presente) => {
    carrinho.dispatch({ tipo: 'adicionar', presente });
    setRecemAdicionado(presente.id);
    setTimeout(() => setRecemAdicionado((id) => (id === presente.id ? null : id)), 1400);
  };

  const noCarrinho = (id: string) => carrinho.itens.find((i) => i.id === id)?.quantidade ?? 0;

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
        {lista &&
          // Categories come in the couple's order; empty ones are skipped.
          lista.categorias.map((c) => {
            const gifts = lista.presentes.filter((p) => p.categoriaId === c.id);
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
      </div>

      {/* Back from the payment page without paying: a small note pinned above the cart, pointing at it. */}
      {avisoCancelado && (
        <div
          className={carrinho.quantidade > 0 && !checkoutAberto ? 'presentes-aviso presentes-aviso--carrinho' : 'presentes-aviso'}
          role="status"
        >
          <span className="presentes-aviso__icone" aria-hidden>
            <Icon name="heart" size={18} />
          </span>
          <span className="presentes-aviso__texto">
            <strong>Pagamento não concluído</strong>
            <span>
              Nada foi cobrado.{carrinho.quantidade > 0 ? ' Seus presentes continuam guardados no carrinho.' : ''}
            </span>
            {carrinho.quantidade > 0 && (
              <button
                className="presentes-aviso__acao"
                onClick={() => {
                  setAvisoCancelado(false);
                  setCheckoutAberto(true);
                }}
              >
                Tentar de novo →
              </button>
            )}
          </span>
          <button className="presentes-aviso__fechar" onClick={() => setAvisoCancelado(false)} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      )}

      {retorno?.tipo === 'sucesso' && retornoAberto && (
        <RetornoPagamento
          uid={retorno.pedido}
          onConcluido={() => carrinho.dispatch({ tipo: 'limpar' })}
          onFechar={() => setRetornoAberto(false)}
        />
      )}

      {carrinho.quantidade > 0 && !checkoutAberto && !retornoAberto && (
        <button
          key={carrinho.quantidade}
          className="presentes-cart-fab"
          onClick={() => setCheckoutAberto(true)}
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

      {checkoutAberto && (
        <Checkout
          itens={carrinho.itens}
          total={carrinho.total}
          onQuantidade={(id, quantidade) => carrinho.dispatch({ tipo: 'quantidade', id, quantidade })}
          onRemover={(id) => carrinho.dispatch({ tipo: 'remover', id })}
          onFechar={() => setCheckoutAberto(false)}
        />
      )}
    </section>
  );
}
