import { useCallback, useState } from 'react';
import {
  CONSENTIMENTO_TOTAL,
  lerConsentimento,
  salvarConsentimento,
  SO_ESSENCIAIS,
  useAbrirPreferenciasDeCookies,
  useConsentimento,
  type Consentimento,
} from '@nv/shared';

// Optional categories the guest can switch on or off, one per flag in Consentimento.
const OPCIONAIS: Array<{ chave: keyof Consentimento; titulo: string; descricao: string }> = [
  {
    chave: 'mapa',
    titulo: 'Mapa do Google',
    descricao: 'Mostra o mapa da seção Local. É carregado do Google, que pode definir cookies próprios.',
  },
];

function Interruptor({ id, ligado, bloqueado, onMudar }: { id: string; ligado: boolean; bloqueado?: boolean; onMudar?: (v: boolean) => void }) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="shell-cookies__interruptor"
      checked={ligado}
      disabled={bloqueado}
      onChange={(e) => onMudar?.(e.target.checked)}
    />
  );
}

// Cookie notice: shown until the guest chooses. "Personalizar" (and the footer link) opens the
// preferences, with a switch per optional category.
export function AvisoCookies() {
  const consentimento = useConsentimento();
  // 'aviso': first visit, until a choice is saved (here or by the map's own button); 'preferencias': the switches.
  const [modo, setModo] = useState<'fechado' | 'aviso' | 'preferencias'>(() => (lerConsentimento() === null ? 'aviso' : 'fechado'));
  const [escolha, setEscolha] = useState<Consentimento>(() => lerConsentimento() ?? SO_ESSENCIAIS);

  useAbrirPreferenciasDeCookies(
    useCallback(() => {
      setEscolha(lerConsentimento() ?? SO_ESSENCIAIS);
      setModo('preferencias');
    }, []),
  );

  if (modo === 'fechado' || (modo === 'aviso' && consentimento !== null)) return null;
  const personalizando = modo === 'preferencias';

  const salvar = (valor: Consentimento) => {
    salvarConsentimento(valor);
    setEscolha(valor);
    setModo('fechado');
  };

  return (
    <section className="shell-cookies" role="region" aria-label="Preferências de cookies">
      <p className="shell-cookies__titulo">{personalizando ? 'Preferências de cookies' : 'Cookies e privacidade'}</p>

      {!personalizando ? (
        <p className="shell-cookies__texto">
          Guardamos no seu navegador só o necessário para o site funcionar, como o carrinho de presentes. Na hora de
          pagar, o formulário seguro do Mercado Pago é carregado no site. O mapa do local é do Google e pode usar
          cookies próprios: escolha se quer permitir.
        </p>
      ) : (
        <ul className="shell-cookies__categorias">
          <li className="shell-cookies__categoria">
            <div>
              <label className="shell-cookies__nome" htmlFor="cookies-essenciais">
                Essenciais <small>sempre ativos</small>
              </label>
              <p className="shell-cookies__descricao">
                O carrinho de presentes (guardado por até 24 horas), o pedido ou Pix em andamento, a abertura do mapa já
                vista e o login do painel dos noivos. Ficam só no seu navegador, sem rastreamento nem anúncios.
              </p>
            </div>
            <Interruptor id="cookies-essenciais" ligado bloqueado />
          </li>
          <li className="shell-cookies__categoria">
            <div>
              <label className="shell-cookies__nome" htmlFor="cookies-pagamento">
                Pagamento (Mercado Pago) <small>necessário para pagar</small>
              </label>
              <p className="shell-cookies__descricao">
                Só na etapa de pagamento, o site carrega o formulário seguro e o script antifraude do Mercado Pago, que
                identifica o dispositivo e usa cookies próprios para proteger a compra. Os dados do cartão vão direto
                para o Mercado Pago, sem passar pelo site. Se você não chegar ao pagamento, nada disso é carregado.
              </p>
            </div>
            <Interruptor id="cookies-pagamento" ligado bloqueado />
          </li>
          {OPCIONAIS.map((c) => (
            <li key={c.chave} className="shell-cookies__categoria">
              <div>
                <label className="shell-cookies__nome" htmlFor={`cookies-${c.chave}`}>
                  {c.titulo}
                </label>
                <p className="shell-cookies__descricao">{c.descricao}</p>
              </div>
              <Interruptor id={`cookies-${c.chave}`} ligado={escolha[c.chave]} onMudar={(v) => setEscolha({ ...escolha, [c.chave]: v })} />
            </li>
          ))}
        </ul>
      )}

      <div className="shell-cookies__acoes">
        {personalizando ? (
          <>
            <button className="nv-btn" onClick={() => salvar(escolha)}>
              Salvar preferências
            </button>
            <button className="nv-btn-ghost" onClick={() => salvar(CONSENTIMENTO_TOTAL)}>
              Aceitar todos
            </button>
          </>
        ) : (
          <>
            <button className="nv-btn" onClick={() => salvar(CONSENTIMENTO_TOTAL)}>
              Aceitar todos
            </button>
            <button className="nv-btn-ghost" onClick={() => salvar(SO_ESSENCIAIS)}>
              Só essenciais
            </button>
            <button className="shell-cookies__detalhes" onClick={() => setModo('preferencias')}>
              Personalizar
            </button>
          </>
        )}
      </div>
    </section>
  );
}
