import { useEffect, useState, type FormEvent } from 'react';
import { casamento, Icon, SectionHeader } from '@nv/shared';
import { ApiError, errorMessage } from '@nv/shared/api';
import type { ConvitePublico, StatusResposta } from '@nv/shared/types';
import { buscarConvite, hashParam, responderConvite } from './storage';
import { InviteQr } from './InviteQr';
import { LeitorConvite } from './LeitorConvite';
import './rsvp.css';

type Form = { status: StatusResposta; acompanhantes: number; mensagem: string };

// Scrolls to the RSVP section and keeps it aligned for a moment, since the
// sections above it (other microfrontends) may still be loading and push it
// down. Stops as soon as the guest scrolls or taps on their own.
function levarAteRsvp() {
  const secao = document.getElementById('presenca');
  if (!secao) return;
  let interagiu = false;
  const parar = () => (interagiu = true);
  const eventos = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
  eventos.forEach((ev) => window.addEventListener(ev, parar, { once: true, passive: true }));

  const alinhar = (comportamento: ScrollBehavior) => {
    if (!interagiu) secao.scrollIntoView({ behavior: comportamento, block: 'start' });
  };
  alinhar('smooth');
  // Re-align instantly if the page above changed height while loading. 'instant'
  // (not 'auto') so the site's CSS smooth scrolling doesn't turn it into an
  // animation that ends in the wrong place.
  [700, 1500, 2500].forEach((ms) => setTimeout(() => alinhar('instant'), ms));
  setTimeout(() => eventos.forEach((ev) => window.removeEventListener(ev, parar)), 3000);
}

export default function Rsvp() {
  const [convite, setConvite] = useState<ConvitePublico | null>(null);
  const [form, setForm] = useState<Form>({ status: 'sim', acompanhantes: 0, mensagem: '' });
  const [editando, setEditando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [lendoQr, setLendoQr] = useState(false);

  const abrirConvite = (c: ConvitePublico) => {
    setConvite(c);
    setForm(c.resposta ? { status: c.resposta.status, acompanhantes: c.resposta.acompanhantes, mensagem: c.resposta.mensagem } : { status: 'sim', acompanhantes: 0, mensagem: '' });
    setEditando(!c.resposta);
    setErro('');
  };

  const carregar = async (code: string) => {
    setCarregando(true);
    setErro('');
    try {
      abrirConvite(await buscarConvite(code));
    } catch (error) {
      setErro(error instanceof ApiError && error.status === 404 ? 'Código não encontrado. Confira com os noivos.' : errorMessage(error));
    } finally {
      setCarregando(false);
    }
  };

  // Personal invite links look like https://site/#convite=NV-A1B2. The browser
  // can't jump there on its own (it isn't an element id), so bring the RSVP
  // section into view once the invite is loaded.
  useEffect(() => {
    const code = hashParam('convite');
    if (!code) return;
    carregar(code).then(levarAteRsvp);
  }, []);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (codigo.trim()) carregar(codigo);
  };

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    if (!convite) return;
    setCarregando(true);
    setErro('');
    try {
      abrirConvite(await responderConvite(convite.codigo, form));
    } catch (error) {
      setErro(errorMessage(error));
    } finally {
      setCarregando(false);
    }
  };

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const respondeu = convite?.resposta && !editando;

  return (
    <section id="presenca" className="nv-section nv-section--alt">
      <div className="nv-container--form rsvp">
        <SectionHeader eyebrow="Confirme sua presença" title="RSVP">
          <p className="nv-lead">
            Sua confirmação nos ajuda muito na organização. Por favor, responda até <strong>{casamento.rsvpAte}</strong>.
          </p>
        </SectionHeader>

        {convite && <p className="nv-italic rsvp-greeting">Olá, {convite.nome}!</p>}

        {!convite && (
          <form className="nv-card rsvp-card" onSubmit={buscar}>
            <p className="rsvp-help">
              Cada convite tem um código único. Escaneie o QR Code impresso no seu convite ou digite o código para
              confirmar sua presença.
            </p>
            <button type="button" className="nv-btn-outline rsvp-qr-btn" onClick={() => setLendoQr(true)}>
              <Icon name="camera" size={18} /> Ler QR Code do convite
            </button>
            <div className="rsvp-ou" aria-hidden>
              <span>ou digite</span>
            </div>
            <label className="nv-label" htmlFor="rsvp-codigo">
              Código do convite
            </label>
            <input
              id="rsvp-codigo"
              className="nv-input rsvp-code-input"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setErro('');
              }}
              placeholder="Ex: NV-A1B2"
              autoComplete="off"
            />
            {erro && <p className="rsvp-error" role="alert">{erro}</p>}
            <button type="submit" className="nv-btn nv-btn--block" disabled={carregando}>
              {carregando ? 'Buscando…' : 'Buscar meu convite'}
            </button>
          </form>
        )}

        {lendoQr && (
          <LeitorConvite
            onFechar={() => setLendoQr(false)}
            onCodigo={(code) => {
              setLendoQr(false);
              setCodigo(code);
              // Keep the personal link in the address bar, like opening it directly.
              history.replaceState(null, '', `${location.pathname}${location.search}#convite=${code}`);
              carregar(code);
            }}
          />
        )}

        {convite && respondeu && (
          <div className="nv-card rsvp-done nv-fade-up">
            <div className="rsvp-done__icon">
              <Icon name="envelope" size={34} />
            </div>
            <h3 className="rsvp-done__title">
              {convite.resposta!.status === 'sim' ? 'Presença confirmada!' : 'Resposta recebida'}
            </h3>
            <p className="rsvp-done__text">
              {convite.resposta!.status === 'sim'
                ? 'Mal podemos esperar para celebrar com você.'
                : 'Sentiremos sua falta. Obrigado por nos avisar com carinho.'}
            </p>
            {convite.resposta!.status === 'sim' && (
              <div className="rsvp-invite">
                <p className="nv-eyebrow">Seu convite digital</p>
                <InviteQr code={convite.codigo} />
                <p className="rsvp-invite__code">{convite.codigo}</p>
                <p className="rsvp-invite__hint">
                  Apresente este QR Code na entrada para validar sua presença. Salve uma captura de tela ou imprima.
                </p>
              </div>
            )}
            <button className="nv-btn-ghost" onClick={() => setEditando(true)}>
              Editar resposta
            </button>
          </div>
        )}

        {convite && !respondeu && (
          <form className="nv-card rsvp-card" onSubmit={confirmar}>
            <label className="nv-label" htmlFor="rsvp-nome">
              Convite
            </label>
            <input id="rsvp-nome" className="nv-input" value={convite.nome} readOnly />

            <label className="nv-label">Você vai comparecer?</label>
            <div className="rsvp-choice">
              {(
                [
                  ['sim', 'Sim, estarei lá'],
                  ['nao', 'Não poderei ir'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={form.status === value ? 'rsvp-choice__btn is-active' : 'rsvp-choice__btn'}
                  aria-pressed={form.status === value}
                  onClick={() => set('status', value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {form.status === 'sim' && convite.limiteAcompanhantes > 0 && (
              <>
                <label className="nv-label" htmlFor="rsvp-acomp">
                  Acompanhantes
                </label>
                <select
                  id="rsvp-acomp"
                  className="nv-input"
                  value={form.acompanhantes}
                  onChange={(e) => set('acompanhantes', Number(e.target.value))}
                >
                  <option value={0}>Somente eu</option>
                  {Array.from({ length: convite.limiteAcompanhantes }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      +{n} acompanhante{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="nv-label" htmlFor="rsvp-msg">
              Recado para os noivos (opcional)
            </label>
            <textarea
              id="rsvp-msg"
              className="nv-input"
              value={form.mensagem}
              onChange={(e) => set('mensagem', e.target.value)}
              placeholder="Deixe uma mensagem carinhosa"
              maxLength={600}
              rows={3}
            />

            {erro && <p className="rsvp-error" role="alert">{erro}</p>}
            <button type="submit" className="nv-btn nv-btn--block" disabled={carregando}>
              {carregando ? 'Enviando…' : 'Confirmar resposta'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
