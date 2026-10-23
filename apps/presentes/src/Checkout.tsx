import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@nv/shared';
import { errorMessage, formatBRL } from '@nv/shared/api';
import { MAX_QUANTIDADE, type ItemCarrinho } from './carrinho';
import { criarPagamento, type Convidado } from './pagamento';

type Etapa = 'carrinho' | 'dados' | 'revisao';
const etapas: Array<[Etapa, string]> = [
  ['carrinho', 'Presentes'],
  ['dados', 'Seus dados'],
  ['revisao', 'Revisão'],
];

type Props = {
  itens: ItemCarrinho[];
  total: number;
  onQuantidade: (id: number, quantidade: number) => void;
  onRemover: (id: number) => void;
  onFechar: () => void;
};

const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
// Keep the "going to a secure page" screen up long enough to be read.
const TEMPO_MINIMO_AVISO = 1800;
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Gift checkout: review the cart, tell us who is giving, check the order, then
// `criarPagamento` creates the order on the API and we redirect to Stripe Checkout.
export function Checkout({ itens, total, onQuantidade, onRemover, onFechar }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('carrinho');
  const [convidado, setConvidado] = useState<Convidado>({ nome: '', email: '', mensagem: '' });
  const [erroDados, setErroDados] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onFechar]);

  // Move focus to the top of each step for keyboard and screen-reader users.
  useEffect(() => {
    painel.current?.querySelector<HTMLElement>('h2')?.focus();
    painel.current?.scrollTo({ top: 0 });
  }, [etapa]);

  // Coming back from Stripe with the browser's back button restores this page
  // from cache; drop the redirect screen so the guest can try again.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => e.persisted && setEnviando(false);
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // An emptied cart can't move forward.
  useEffect(() => {
    if (itens.length === 0) setEtapa('carrinho');
  }, [itens.length]);

  const enviarDados = (e: FormEvent) => {
    e.preventDefault();
    if (!convidado.nome.trim()) return setErroDados('Informe seu nome.');
    if (!emailValido(convidado.email)) return setErroDados('Informe um e-mail válido para receber o comprovante.');
    setErroDados('');
    setEtapa('revisao');
  };

  const pagar = async () => {
    setEnviando(true);
    setAviso('');
    try {
      const [url] = await Promise.all([
        criarPagamento({
          itens,
          totalCentavos: total,
          convidado: { nome: convidado.nome.trim(), email: convidado.email.trim(), mensagem: convidado.mensagem.trim() },
        }),
        esperar(TEMPO_MINIMO_AVISO),
      ]);
      // The browser leaves for Stripe, so the redirect screen stays up.
      window.location.assign(url);
    } catch (error) {
      setAviso(errorMessage(error));
      setEnviando(false);
    }
  };

  const atual = etapas.findIndex(([id]) => id === etapa);
  const set = (campo: keyof Convidado, valor: string) => setConvidado((c) => ({ ...c, [campo]: valor }));

  return (
    <div className="checkout-overlay" onClick={onFechar}>
      <div
        ref={painel}
        className="checkout"
        role="dialog"
        aria-modal="true"
        aria-label="Finalizar presente"
        onClick={(e) => e.stopPropagation()}
      >
        {enviando && (
          <div className="checkout__redirect" role="status" aria-live="assertive">
            <span className="checkout__redirect-icon">
              <Icon name="shield" size={40} />
            </span>
            <h2 className="checkout__redirect-title">Indo para o ambiente seguro</h2>
            <p className="checkout__redirect-text">
              Estamos levando você para a página de pagamento do Stripe. Lá, seus dados são criptografados e protegidos;
              o site do casamento não tem acesso aos dados do seu cartão ou do seu Pix.
            </p>
            <span className="checkout__redirect-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <p className="checkout__redirect-seal">
              <Icon name="lock" size={14} /> Conexão segura · Stripe, certificado PCI DSS nível 1
            </p>
          </div>
        )}

        <header className="checkout__header">
          <ol className="checkout__steps" aria-label="Etapas">
            {etapas.map(([id, label], i) => (
              <li
                key={id}
                className={i < atual ? 'is-done' : i === atual ? 'is-current' : ''}
                aria-current={i === atual ? 'step' : undefined}
              >
                <span className="checkout__step-dot">{i < atual ? '✓' : i + 1}</span>
                <span className="checkout__step-label">{label}</span>
              </li>
            ))}
          </ol>
          <button className="checkout__close" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>

        {etapa === 'carrinho' && (
          <section className="checkout__body nv-fade-up">
            <h2 className="checkout__title" tabIndex={-1}>
              Seus presentes
            </h2>
            {itens.length === 0 ? (
              <div className="checkout__empty">
                <Icon name="gift" size={40} />
                <p>Nenhum presente escolhido ainda.</p>
                <button className="nv-btn-outline" onClick={onFechar}>
                  Ver a lista
                </button>
              </div>
            ) : (
              <>
                <ul className="checkout__items">
                  {itens.map((item) => (
                    <li key={item.id} className="checkout__item">
                      <div className="checkout__item-info">
                        <strong>{item.nome}</strong>
                        <span>{formatBRL(item.valorCentavos)} cada</span>
                      </div>
                      <div className="checkout__qty" role="group" aria-label={`Quantidade de ${item.nome}`}>
                        <button
                          onClick={() => onQuantidade(item.id, item.quantidade - 1)}
                          disabled={item.quantidade <= 1}
                          aria-label="Diminuir"
                        >
                          −
                        </button>
                        <span aria-live="polite">{item.quantidade}</span>
                        <button
                          onClick={() => onQuantidade(item.id, item.quantidade + 1)}
                          disabled={item.quantidade >= Math.min(MAX_QUANTIDADE, item.maximo ?? MAX_QUANTIDADE)}
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>
                      <span className="checkout__item-total">{formatBRL(item.valorCentavos * item.quantidade)}</span>
                      <button className="checkout__remove" onClick={() => onRemover(item.id)} aria-label={`Remover ${item.nome}`}>
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="checkout__total">
                  <span>Total</span>
                  <strong>{formatBRL(total)}</strong>
                </div>
                <button className="nv-btn nv-btn--block" onClick={() => setEtapa('dados')}>
                  Continuar
                </button>
                <button className="checkout__link" onClick={onFechar}>
                  Escolher mais presentes
                </button>
              </>
            )}
          </section>
        )}

        {etapa === 'dados' && (
          <form className="checkout__body nv-fade-up" onSubmit={enviarDados} noValidate>
            <h2 className="checkout__title" tabIndex={-1}>
              Quem está presenteando?
            </h2>
            <p className="checkout__hint">Assim os noivos sabem de quem veio o carinho.</p>

            <label className="nv-label" htmlFor="checkout-nome">
              Seu nome
            </label>
            <input
              id="checkout-nome"
              className="nv-input"
              autoComplete="name"
              maxLength={120}
              value={convidado.nome}
              onChange={(e) => set('nome', e.target.value)}
            />

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
              Revisar pedido
            </button>
            <button type="button" className="checkout__link" onClick={() => setEtapa('carrinho')}>
              ← Voltar aos presentes
            </button>
          </form>
        )}

        {etapa === 'revisao' && (
          <section className="checkout__body nv-fade-up">
            <h2 className="checkout__title" tabIndex={-1}>
              Revise seu presente
            </h2>

            <ul className="checkout__summary">
              {itens.map((i) => (
                <li key={i.id}>
                  <span>
                    {i.quantidade > 1 && `${i.quantidade}× `}
                    {i.nome}
                  </span>
                  <span>{formatBRL(i.valorCentavos * i.quantidade)}</span>
                </li>
              ))}
              <li className="checkout__summary-total">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </li>
            </ul>

            <div className="checkout__review">
              <div>
                <span className="nv-label">De</span>
                <p>
                  {convidado.nome.trim()} · {convidado.email.trim()}
                </p>
              </div>
              {convidado.mensagem.trim() && (
                <div>
                  <span className="nv-label">Mensagem</span>
                  <p className="checkout__review-msg">“{convidado.mensagem.trim()}”</p>
                </div>
              )}
              <button className="checkout__link checkout__link--inline" onClick={() => setEtapa('dados')}>
                Editar dados
              </button>
            </div>

            {aviso && (
              <p className="checkout__alert" role="alert">
                {aviso}
              </p>
            )}
            <div className="checkout__seguranca">
              <span className="checkout__seguranca-icon">
                <Icon name="lock" size={22} />
              </span>
              <div>
                <strong>Pagamento em ambiente seguro</strong>
                <p>
                  Ao continuar, você será redirecionado para a página de pagamento do <b>Stripe</b>, onde pode pagar
                  com Pix ou cartão. Seus dados de pagamento ficam protegidos com criptografia e não passam pelo nosso
                  site nem ficam guardados conosco.
                </p>
              </div>
            </div>
            <button className="nv-btn nv-btn--block" onClick={pagar} disabled={enviando}>
              <Icon name="lock" size={16} /> {`Pagar ${formatBRL(total)} com segurança`}
            </button>
            <button className="checkout__link" onClick={() => setEtapa('carrinho')}>
              ← Voltar aos presentes
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
