import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon, navegar, useEndereco } from '@nv/shared';
import { errorMessage, formatBRL } from '@nv/shared/api';
import type { PedidoInput } from '@nv/shared/types';
import { MAX_QUANTIDADE, useCarrinho } from './carrinho';
import { abrirLink, chaveDoCarrinho, criarLink, PARAMETRO_LINK } from './linkCheckout';
import { buscarLista } from './lista';
import { configPagamento, lembrarPedidoAberto, pagar, type Convidado } from './pagamento';
import { PagamentoBrick } from './PagamentoBrick';
import { Pedido } from './Pedido';
import './presentes.css';

// The gift checkout as pages of its own, each with an address, so the browser's back button moves
// between steps:
//   /presentear              the cart
//   /presentear/dados        who is giving
//   /presentear/pagamento    Mercado Pago's payment form
//   /presentear/pedido/<id>  thank-you, or the Pix to pay
// The first three carry the cart in the address, encrypted by the API (?c=<link>, see linkCheckout.ts),
// so a reload, another device or a link sent to someone opens the same gifts. Only gifts and amounts:
// the guest's name, e-mail and CPF never go in the address.
const BASE = '/presentear';
type Etapa = 'carrinho' | 'dados' | 'pagamento';
const ETAPAS: Array<[Etapa, string, string]> = [
  ['carrinho', 'Presentes', BASE],
  ['dados', 'Seus dados', `${BASE}/dados`],
  ['pagamento', 'Pagamento', `${BASE}/pagamento`],
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Name, e-mail and message survive a reload (sessionStorage, this tab only); the CPF never leaves memory.
const RASCUNHO = 'nv_presentear_convidado';
const VAZIO: Convidado = { nome: '', email: '', mensagem: '', cpf: '' };

function lerRascunho(): Convidado {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(RASCUNHO) ?? 'null') as Partial<Convidado> | null;
    return {
      ...VAZIO,
      nome: typeof salvo?.nome === 'string' ? salvo.nome : '',
      email: typeof salvo?.email === 'string' ? salvo.email : '',
      mensagem: typeof salvo?.mensagem === 'string' ? salvo.mensagem : '',
    };
  } catch {
    return VAZIO;
  }
}

function guardarRascunho(c: Convidado | null) {
  try {
    if (c) sessionStorage.setItem(RASCUNHO, JSON.stringify({ nome: c.nome, email: c.email, mensagem: c.mensagem }));
    else sessionStorage.removeItem(RASCUNHO);
  } catch {
    // storage blocked: the form just starts empty after a reload
  }
}

const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
const soDigitos = (texto: string) => texto.replace(/\D/g, '');
const formatarCpf = (texto: string) =>
  soDigitos(texto)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const dadosCompletos = (c: Convidado) => !!c.nome.trim() && emailValido(c.email) && soDigitos(c.cpf).length === 11;

export default function Presentear() {
  const endereco = useEndereco();
  const caminho = endereco.caminho.replace(/\/+$/, '');
  const link = endereco.busca.get(PARAMETRO_LINK);
  const resto = caminho.slice(BASE.length).replace(/^\//, '');
  const pedidoUid = resto.startsWith('pedido/') ? resto.slice('pedido/'.length) : null;
  const etapa: Etapa = resto === 'dados' ? 'dados' : resto === 'pagamento' ? 'pagamento' : 'carrinho';

  const carrinho = useCarrinho();
  const [listaCarregada, setListaCarregada] = useState(false);
  const [convidado, setConvidadoEstado] = useState<Convidado>(lerRascunho);
  const [erroDados, setErroDados] = useState('');
  const [aviso, setAviso] = useState('');
  // A link that couldn't be opened (expired, altered): stays on screen across the redirects.
  const [avisoLink, setAvisoLink] = useState('');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  // Set once this visit created an order: the cart is cleared only then (not for an older Pix reopened).
  const pedidoNovo = useRef<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  const setConvidado = (c: Convidado) => {
    setConvidadoEstado(c);
    guardarRascunho(c);
  };

  // Moving between steps keeps the cart's link in the address.
  const ir = (destino: string, opcoes?: { substituir?: boolean }) =>
    navegar(link ? `${destino}?${PARAMETRO_LINK}=${encodeURIComponent(link)}` : destino, opcoes);

  // The link in the address when the checkout opens (a ref, so writing a new link doesn't reload the list).
  const linkAtual = useRef(link);
  linkAtual.current = link;
  // Which cart the address's link holds, to make a new one only when the guest changes the cart.
  const chaveDoLink = useRef<string | null>(null);

  // A link in the address replaces the cart; then names, prices and availability come fresh from the
  // API (the cart only keeps ids and amounts).
  const noCheckout = pedidoUid === null;
  const despachar = carrinho.dispatch;
  useEffect(() => {
    if (!noCheckout) return;
    let ativo = true;
    (async () => {
      const recebido = linkAtual.current;
      if (recebido && chaveDoLink.current === null) {
        try {
          const itens = await abrirLink(recebido);
          if (!ativo) return;
          chaveDoLink.current = chaveDoCarrinho(itens);
          despachar({ tipo: 'substituir', itens });
        } catch (error) {
          if (ativo) setAvisoLink(errorMessage(error));
        }
      }
      const lista = await buscarLista();
      if (ativo) despachar({ tipo: 'sincronizar', presentes: lista.presentes });
    })()
      .catch((error) => ativo && setAviso(errorMessage(error)))
      .finally(() => ativo && setListaCarregada(true));
    return () => {
      ativo = false;
    };
  }, [noCheckout, despachar]);

  // The cart changed (or came without a link): a new link replaces the one in the address, without
  // a new history entry. Waits for the guest to stop clicking + and −.
  const chave = chaveDoCarrinho(carrinho.itens);
  const itensAtuais = useRef(carrinho.itens);
  itensAtuais.current = carrinho.itens;
  useEffect(() => {
    if (!noCheckout || !listaCarregada || !chave) return;
    if (chave === chaveDoLink.current && linkAtual.current) return;
    const espera = setTimeout(() => {
      criarLink(itensAtuais.current)
        .then(({ link: novo }) => {
          chaveDoLink.current = chave;
          // The guest may have left the checkout meanwhile (paid, or back to the site).
          if (!location.pathname.startsWith(BASE) || location.pathname.includes('/pedido/')) return;
          const url = new URL(location.href);
          url.searchParams.set(PARAMETRO_LINK, novo);
          navegar(url.pathname + url.search, { substituir: true, rolar: false });
        })
        .catch(() => {
          // without a link the checkout still works; the address just doesn't carry the cart
        });
    }, 400);
    return () => clearTimeout(espera);
  }, [noCheckout, listaCarregada, chave]);

  // A step that needs what came before (e.g. the payment page reloaded, so the CPF is gone) goes back to it.
  useEffect(() => {
    if (pedidoUid) return;
    if (etapa !== 'carrinho' && listaCarregada && carrinho.itens.length === 0) navegar(BASE, { substituir: true });
    else if (etapa === 'pagamento' && !dadosCompletos(convidado)) ir(`${BASE}/dados`, { substituir: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ir` only reads the current link
  }, [etapa, pedidoUid, listaCarregada, carrinho.itens.length, convidado]);

  // Each page starts with focus on its title, for keyboard and screen-reader users.
  useEffect(() => {
    titulo.current?.focus();
    setAviso('');
  }, [etapa, pedidoUid]);

  // The payment page needs the connected account's public key for Mercado Pago's form.
  useEffect(() => {
    if (etapa !== 'pagamento' || publicKey) return;
    configPagamento()
      .then((c) => (c.publicKey ? setPublicKey(c.publicKey) : setAviso('O pagamento online ainda não está disponível. Tente mais tarde.')))
      .catch((error) => setAviso(errorMessage(error)));
  }, [etapa, publicKey]);

  const enviarDados = (e: FormEvent) => {
    e.preventDefault();
    if (!convidado.nome.trim()) return setErroDados('Informe seu nome.');
    if (!emailValido(convidado.email)) return setErroDados('Informe um e-mail válido para receber o comprovante.');
    if (soDigitos(convidado.cpf).length !== 11) return setErroDados('Informe seu CPF: o Mercado Pago pede para qualquer pagamento.');
    setErroDados('');
    ir(`${BASE}/pagamento`);
  };

  // Called by Mercado Pago's form. Throwing keeps the guest on the form to try again.
  const pagarCom = async (pagamento: PedidoInput['pagamento']) => {
    setAviso('');
    let resultado;
    try {
      resultado = await pagar(carrinho.itens, carrinho.total, {
        nome: convidado.nome.trim(),
        email: convidado.email.trim(),
        mensagem: convidado.mensagem.trim(),
        cpf: soDigitos(convidado.cpf),
      }, pagamento);
    } catch (error) {
      setAviso(errorMessage(error));
      throw error;
    }
    if (resultado.status === 'falhou') {
      setAviso(resultado.motivo ?? 'O pagamento foi recusado e nada foi cobrado. Tente de novo.');
      throw new Error(resultado.motivo);
    }
    // A Pix waiting, or a payment Mercado Pago didn't confirm yet: kept to show again on a later visit.
    if (resultado.status === 'aguardando' || resultado.status === 'pendente') lembrarPedidoAberto(resultado.pedido);
    pedidoNovo.current = resultado.pedido;
    // Paid or under way: the next gift starts with an empty form.
    setConvidadoEstado(VAZIO);
    guardarRascunho(null);
    // Replace, not push: "back" from the order shouldn't land on a payment page for an emptied cart.
    navegar(`${BASE}/pedido/${resultado.pedido}`, { substituir: true });
  };

  const voltarALista = () => navegar('/#presentes');
  const set = (campo: keyof Convidado, valor: string) => setConvidado({ ...convidado, [campo]: valor });
  const atual = ETAPAS.findIndex(([id]) => id === etapa);
  const totalItens = carrinho.itens.reduce((n, i) => n + i.quantidade, 0);

  return (
    <div className="presentear">
      {/* A focused header, without the site's menu: where you are, and that the payment is safe. */}
      <header className="presentear__topo">
        <button className="presentear__marca" onClick={voltarALista} aria-label="Voltar ao site">
          N<em>&amp;</em>V
        </button>
        {!pedidoUid && (
          <ol className="checkout__steps presentear__etapas" aria-label="Etapas">
            {ETAPAS.map(([id, label], i) => (
              <li key={id} className={i < atual ? 'is-done' : i === atual ? 'is-current' : ''} aria-current={i === atual ? 'step' : undefined}>
                <span className="checkout__step-dot">{i < atual ? '✓' : i + 1}</span>
                <span className="checkout__step-label">{label}</span>
              </li>
            ))}
          </ol>
        )}
        <span className="presentear__selo">
          <Icon name="lock" size={14} /> Pagamento seguro · Mercado Pago
        </span>
      </header>

      <main className="presentear__conteudo">
        {pedidoUid && UUID.test(pedidoUid) && (
          <Pedido
            uid={pedidoUid}
            onConcluido={() => {
              if (pedidoNovo.current === pedidoUid) carrinho.dispatch({ tipo: 'limpar' });
            }}
          />
        )}
        {pedidoUid && !UUID.test(pedidoUid) && (
          <section className="presentear__vazio">
            <h1 className="presentear__titulo">Pedido não encontrado</h1>
            <button className="nv-btn-outline" onClick={voltarALista}>
              Ver a lista de presentes
            </button>
          </section>
        )}

        {!pedidoUid && etapa === 'carrinho' && (
          <section className="presentear__pagina nv-fade-up">
            <h1 className="presentear__titulo" tabIndex={-1} ref={titulo}>
              Seus presentes
            </h1>
            {avisoLink && (
              <p className="checkout__alert" role="alert">
                {avisoLink}
              </p>
            )}
            {!listaCarregada && <p className="checkout__hint">Carregando…</p>}
            {listaCarregada && carrinho.itens.length === 0 ? (
              <div className="checkout__empty">
                <Icon name="gift" size={40} />
                <p>Nenhum presente escolhido ainda.</p>
                <button className="nv-btn-outline" onClick={voltarALista}>
                  Ver a lista
                </button>
              </div>
            ) : (
              listaCarregada && (
                <>
                  <ul className="checkout__items">
                    {carrinho.itens.map((item) => (
                      <li key={item.id} className="checkout__item">
                        <div className="checkout__item-info">
                          <strong>{item.nome}</strong>
                          <span>{formatBRL(item.valorCentavos)} cada</span>
                        </div>
                        <div className="checkout__qty" role="group" aria-label={`Quantidade de ${item.nome}`}>
                          <button
                            onClick={() => carrinho.dispatch({ tipo: 'quantidade', id: item.id, quantidade: item.quantidade - 1 })}
                            disabled={item.quantidade <= 1}
                            aria-label="Diminuir"
                          >
                            −
                          </button>
                          <span aria-live="polite">{item.quantidade}</span>
                          <button
                            onClick={() => carrinho.dispatch({ tipo: 'quantidade', id: item.id, quantidade: item.quantidade + 1 })}
                            disabled={item.quantidade >= Math.min(MAX_QUANTIDADE, item.maximo ?? MAX_QUANTIDADE)}
                            aria-label="Aumentar"
                          >
                            +
                          </button>
                        </div>
                        <span className="checkout__item-total">{formatBRL(item.valorCentavos * item.quantidade)}</span>
                        <button className="checkout__remove" onClick={() => carrinho.dispatch({ tipo: 'remover', id: item.id })} aria-label={`Remover ${item.nome}`}>
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="checkout__total">
                    <span>Total</span>
                    <strong>{formatBRL(carrinho.total)}</strong>
                  </div>
                  <button className="nv-btn nv-btn--block" onClick={() => ir(`${BASE}/dados`)}>
                    Continuar
                  </button>
                  <button className="checkout__link" onClick={voltarALista}>
                    ← Escolher mais presentes
                  </button>
                </>
              )
            )}
            {aviso && (
              <p className="checkout__alert" role="alert">
                {aviso}
              </p>
            )}
          </section>
        )}

        {!pedidoUid && etapa === 'dados' && (
          <form className="presentear__pagina nv-fade-up" onSubmit={enviarDados} noValidate>
            <h1 className="presentear__titulo" tabIndex={-1} ref={titulo}>
              Quem está presenteando?
            </h1>
            <p className="checkout__hint">Assim os noivos sabem de quem veio o carinho.</p>

            <label className="nv-label" htmlFor="checkout-nome">
              Seu nome
            </label>
            <input id="checkout-nome" className="nv-input" autoComplete="name" maxLength={120} value={convidado.nome} onChange={(e) => set('nome', e.target.value)} />

            <label className="nv-label" htmlFor="checkout-email">
              E-mail
            </label>
            <input
              id="checkout-email"
              className="nv-input"
              type="email"
              autoComplete="email"
              maxLength={200}
              value={convidado.email}
              onChange={(e) => set('email', e.target.value)}
            />

            <label className="nv-label" htmlFor="checkout-cpf">
              CPF
            </label>
            <input
              id="checkout-cpf"
              className="nv-input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={convidado.cpf}
              onChange={(e) => set('cpf', formatarCpf(e.target.value))}
            />
            <p className="checkout__hint checkout__hint--campo">Pedido pelo Mercado Pago para a segurança do pagamento. Não fica guardado no site.</p>

            <label className="nv-label" htmlFor="checkout-msg">
              Mensagem para os noivos (opcional)
            </label>
            <textarea
              id="checkout-msg"
              className="nv-input"
              rows={3}
              maxLength={500}
              placeholder="Escreva um carinho que vai junto com o presente"
              value={convidado.mensagem}
              onChange={(e) => set('mensagem', e.target.value)}
            />

            {erroDados && (
              <p className="checkout__alert" role="alert">
                {erroDados}
              </p>
            )}
            <button type="submit" className="nv-btn nv-btn--block">
              Ir para o pagamento
            </button>
            <button type="button" className="checkout__link" onClick={() => ir(BASE)}>
              ← Voltar aos presentes
            </button>
          </form>
        )}

        {!pedidoUid && etapa === 'pagamento' && dadosCompletos(convidado) && carrinho.itens.length > 0 && (
          <section className="presentear__pagamento nv-fade-up">
            <div className="presentear__resumo">
              <h1 className="presentear__titulo" tabIndex={-1} ref={titulo}>
                Pagamento
              </h1>
              <ul className="checkout__summary">
                {carrinho.itens.map((i) => (
                  <li key={i.id}>
                    <span>
                      {i.quantidade > 1 && `${i.quantidade}× `}
                      {i.nome}
                    </span>
                    <span>{formatBRL(i.valorCentavos * i.quantidade)}</span>
                  </li>
                ))}
                <li className="checkout__summary-total">
                  <span>Total{totalItens > 1 ? ` (${totalItens} presentes)` : ''}</span>
                  <span>{formatBRL(carrinho.total)}</span>
                </li>
              </ul>
            </div>
            <div className="presentear__formulario">
              {aviso && (
                <p className="checkout__alert" role="alert">
                  {aviso}
                </p>
              )}
              {publicKey && (
                <PagamentoBrick
                  publicKey={publicKey}
                  totalCentavos={carrinho.total}
                  email={convidado.email.trim()}
                  cpf={soDigitos(convidado.cpf)}
                  onPagar={pagarCom}
                />
              )}
            </div>
            {/* Under the summary on a computer; after the form on a phone, so the form shows first. */}
            <div className="presentear__extra">
              <div className="presentear__de">
                <span className="nv-label">De</span>
                <p>
                  {convidado.nome.trim()} · {convidado.email.trim()}
                </p>
                {convidado.mensagem.trim() && <p className="checkout__review-msg">“{convidado.mensagem.trim()}”</p>}
                <button className="checkout__link checkout__link--inline" onClick={() => ir(`${BASE}/dados`)}>
                  Editar dados
                </button>
              </div>
              <p className="checkout__selo">
                <Icon name="lock" size={14} /> O formulário de pagamento é do <b>Mercado Pago</b>: os dados do cartão vão direto
                para ele, criptografados, e não passam pelo nosso site.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* The order's page has its own way back. */}
      {!pedidoUid && (
        <footer className="presentear__rodape">
          <button className="checkout__link" onClick={voltarALista}>
            ← Voltar à lista de presentes
          </button>
        </footer>
      )}
    </div>
  );
}
