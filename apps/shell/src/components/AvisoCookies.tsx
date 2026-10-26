import { useCallback, useState } from 'react';
import { lerConsentimento, salvarConsentimento, useAbrirPreferenciasDeCookies, type Consentimento } from '@nv/shared';

// Cookie notice: shown until the guest chooses, and again from the footer link.
export function AvisoCookies() {
  const [aberto, setAberto] = useState(() => lerConsentimento() === null);
  const [detalhes, setDetalhes] = useState(false);
  useAbrirPreferenciasDeCookies(useCallback(() => setAberto(true), []));

  if (!aberto) return null;

  const escolher = (valor: Consentimento) => {
    salvarConsentimento(valor);
    setAberto(false);
    setDetalhes(false);
  };

  return (
    <section className="shell-cookies" role="region" aria-label="Aviso de cookies">
      <p className="shell-cookies__titulo">Cookies e privacidade</p>
      <p className="shell-cookies__texto">
        Guardamos no seu navegador só o necessário para o site funcionar, como o carrinho de presentes. O mapa do
        local é do Google e pode usar cookies próprios: ele só carrega se você permitir.
      </p>
      {detalhes && (
        <ul className="shell-cookies__lista">
          <li>
            <strong>Essenciais (sempre ativos):</strong> o carrinho e o pagamento em andamento, a abertura do mapa
            já vista e o login do painel dos noivos. Ficam só no seu navegador; não há rastreamento nem anúncios.
          </li>
          <li>
            <strong>Mapa do Google (opcional):</strong> o mapa da seção Local é carregado do Google, que pode
            definir cookies próprios.
          </li>
          <li>
            <strong>Pagamento:</strong> é feito nas páginas do Stripe, que usa cookies próprios para a segurança da
            compra.
          </li>
        </ul>
      )}
      <div className="shell-cookies__acoes">
        <button className="nv-btn" onClick={() => escolher('todos')}>
          Aceitar todos
        </button>
        <button className="nv-btn-ghost" onClick={() => escolher('essenciais')}>
          Só essenciais
        </button>
        <button className="shell-cookies__detalhes" onClick={() => setDetalhes((d) => !d)} aria-expanded={detalhes}>
          {detalhes ? 'Menos detalhes' : 'Detalhes'}
        </button>
      </div>
    </section>
  );
}
