import { useEffect, useState, type FormEvent } from 'react';
import { Branch, Ornament } from '@nv/shared';
import { api, errorMessage } from '@nv/shared/api';
import type { ConvitePainel, Usuario } from '@nv/shared/types';

const SENHA_MINIMA = 10;

// Page opened from the invite e-mail (/painel#definir-senha=TOKEN): create the password and enter.
export function DefinirSenha({ token, onEntrar, onCancelar }: { token: string; onEntrar: (u: Usuario) => void; onCancelar: () => void }) {
  const [convite, setConvite] = useState<ConvitePainel | null>(null);
  const [invalido, setInvalido] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<ConvitePainel>(`/auth/convite/${encodeURIComponent(token)}`)
      .then(setConvite)
      .catch((error) => setInvalido(errorMessage(error)));
  }, [token]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (senha.length < SENHA_MINIMA) return setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (senha !== confirmacao) return setErro('As duas senhas não são iguais.');
    setEnviando(true);
    setErro('');
    try {
      const { usuario } = await api<{ usuario: Usuario }>(`/auth/convite/${encodeURIComponent(token)}`, { method: 'POST', body: { senha } });
      onEntrar(usuario);
    } catch (error) {
      setErro(errorMessage(error));
      setEnviando(false);
    }
  };

  return (
    <main className="painel-login">
      <Branch className="painel-login__branch painel-login__branch--tl" />
      <Branch className="painel-login__branch painel-login__branch--br" />
      <form className="painel-login__card nv-fade-up" onSubmit={salvar}>
        <p className="painel-login__monogram">
          N<span>&amp;</span>V
        </p>
        <h1 className="painel-login__title">Criar sua senha</h1>
        <Ornament className="nv-ornament" />

        {!convite && !invalido && <p className="painel-login__lead">Conferindo o convite…</p>}

        {invalido && (
          <>
            <p className="painel-alert" role="alert">
              {invalido}
            </p>
            <button type="button" className="nv-btn nv-btn--block" onClick={onCancelar}>
              Ir para o login
            </button>
          </>
        )}

        {convite && (
          <>
            <p className="painel-login__lead">
              Olá, {convite.nome.split(' ')[0]}! Crie a senha para entrar no painel com <strong>{convite.email}</strong>.
            </p>
            {erro && (
              <p className="painel-alert" role="alert">
                {erro}
              </p>
            )}
            <input type="email" name="username" autoComplete="username" value={convite.email} readOnly hidden />
            <label className="nv-label" htmlFor="definir-senha">
              Nova senha
            </label>
            <div className="painel-senha">
              <input
                id="definir-senha"
                className="nv-input"
                type={mostrar ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
              <button type="button" className="painel-link" onClick={() => setMostrar((m) => !m)}>
                {mostrar ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <label className="nv-label" htmlFor="definir-confirmacao">
              Repita a senha
            </label>
            <input
              id="definir-confirmacao"
              className="nv-input"
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
            />
            <p className="painel-hint">Pelo menos {SENHA_MINIMA} caracteres.</p>
            <button type="submit" className="nv-btn nv-btn--block" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Criar senha e entrar'}
            </button>
          </>
        )}
        <a className="painel-login__back" href="/">
          ← Voltar para o site
        </a>
      </form>
    </main>
  );
}
