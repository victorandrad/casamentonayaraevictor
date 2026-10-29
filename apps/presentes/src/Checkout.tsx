import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@nv/shared';
import { errorMessage, formatBRL } from '@nv/shared/api';
import type { PedidoInput } from '@nv/shared/types';
import { MAX_QUANTIDADE, type ItemCarrinho } from './carrinho';
import { configPagamento, lembrarPedidoAberto, pagar, type Convidado } from './pagamento';
import { PagamentoBrick } from './PagamentoBrick';

type Etapa = 'carrinho' | 'dados' | 'pagamento';
const etapas: Array<[Etapa, string]> = [
  ['carrinho', 'Presentes'],
  ['dados', 'Seus dados'],
  ['pagamento', 'Pagamento'],
];

type Props = {
  itens: ItemCarrinho[];
  total: number;
  onQuantidade: (id: string, quantidade: number) => void;
  onRemover: (id: string) => void;
  onFechar: () => void;
  // The payment went through (card approved) or a Pix is waiting: show the order's screen.
  onConcluido: (pedido: string) => void;
};

const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
const soDigitos = (texto: string) => texto.replace(/\D/g, '');
const formatarCpf = (texto: string) =>
  soDigitos(texto)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

// Gift checkout: review the cart, tell us who is giving, then pay right here with Mercado Pago's
// Payment Brick (card or Pix). The order is created only when the guest presses "Pagar".
export function Checkout({ itens, total, onQuantidade, onRemover, onFechar, onConcluido }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('carrinho');
  const [convidado, setConvidado] = useState<Convidado>({ nome: '', email: '', mensagem: '', cpf: '' });
  const [erroDados, setErroDados] = useState('');
  const [aviso, setAviso] = useState('');
  const [publicKey, setPublicKey] = useState<string | null>(null);
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

  // The payment step needs the connected account's public key for the Brick.
  useEffect(() => {
    if (etapa !== 'pagamento' || publicKey) return;
    configPagamento()
      .then((c) => (c.publicKey ? setPublicKey(c.publicKey) : setAviso('O pagamento online ainda não está disponível. Tente mais tarde.')))
      .catch((error) => setAviso(errorMessage(error)));
  }, [etapa, publicKey]);

  // An emptied cart can't move forward.
  useEffect(() => {
    if (itens.length === 0) setEtapa('carrinho');
  }, [itens.length]);

  const enviarDados = (e: FormEvent) => {
    e.preventDefault();
    if (!convidado.nome.trim()) return setErroDados('Informe seu nome.');
    if (!emailValido(convidado.email)) return setErroDados('Informe um e-mail válido para receber o comprovante.');
    if (soDigitos(convidado.cpf).length !== 11) return setErroDados('Informe seu CPF: o Mercado Pago pede para qualquer pagamento.');
    setErroDados('');
    setAviso('');
    setEtapa('pagamento');
  };

  const dadosDoConvidado = (): Convidado => ({
    nome: convidado.nome.trim(),
    email: convidado.email.trim(),
    mensagem: convidado.mensagem.trim(),
    cpf: soDigitos(convidado.cpf),
  });

  // Called by the Brick. Throwing keeps the guest on the form to try again.
  const pagarCom = async (pagamento: PedidoInput['pagamento']) => {
    setAviso('');
    let resultado;
    try {
      resultado = await pagar(itens, total, dadosDoConvidado(), pagamento);
    } catch (error) {
      setAviso(errorMessage(error));
      throw error;
    }
    if (resultado.status === 'falhou') {
      setAviso(resultado.motivo ?? 'O pagamento foi recusado e nada foi cobrado. Tente de novo.');
      throw new Error(resultado.motivo);
    }
    // A Pix waiting, or a payment Mercado Pago didn't confirm yet: keep it to show again after a reload.
    if (resultado.status === 'aguardando' || resultado.status === 'pendente') lembrarPedidoAberto(resultado.pedido);
    onConcluido(resultado.pedido);
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
            <button type="button" className="checkout__link" onClick={() => setEtapa('carrinho')}>
              ← Voltar aos presentes
            </button>
          </form>
        )}

        {etapa === 'pagamento' && (
          <section className="checkout__body nv-fade-up">
            <h2 className="checkout__title" tabIndex={-1}>
              Pagamento
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

            <div className="checkout__seguranca">
              <span className="checkout__seguranca-icon">
                <Icon name="lock" size={22} />
              </span>
              <div>
                <strong>Pagamento seguro pelo Mercado Pago</strong>
                <p>
                  Pague com Pix ou cartão em até 12x sem sair do site. O formulário abaixo é do <b>Mercado Pago</b>: os dados
                  do cartão vão direto para ele, criptografados, e não passam pelo nosso site nem ficam guardados conosco.
                </p>
              </div>
            </div>

            {aviso && (
              <p className="checkout__alert" role="alert">
                {aviso}
              </p>
            )}
            {publicKey && (
              <PagamentoBrick
                publicKey={publicKey}
                totalCentavos={total}
                email={convidado.email.trim()}
                cpf={soDigitos(convidado.cpf)}
                onPagar={pagarCom}
              />
            )}
            <button className="checkout__link" onClick={() => setEtapa('carrinho')}>
              ← Voltar aos presentes
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
