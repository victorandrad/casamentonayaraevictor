import { useState, type FormEvent } from 'react';
import { Branch, Ornament } from '@nv/shared';
import { api, errorMessage } from '@nv/shared/api';
import type { LoginInput, Usuario } from '@nv/shared/types';

// Login screen, with the "forgot my password" request in the same card.
export function Login({ aviso, onEntrar }: { aviso?: string; onEntrar: (u: Usuario) => void }) {
  const [modo, setModo] = useState<'entrar' | 'recuperar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      const body: LoginInput = { email, senha };
      const { usuario } = await api<{ usuario: Usuario }>('/auth/login', { method: 'POST', body });
      onEntrar(usuario);
    } catch (error) {
      setErro(errorMessage(error));
      setSenha('');
    } finally {
      setEnviando(false);
    }
  };

  const recuperar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      await api('/auth/recuperar-senha', { method: 'POST', body: { email } });
      setEnviado(true);
    } catch (error) {
      setErro(errorMessage(error));
    } finally {
      setEnviando(false);
    }
  };

  const trocarModo = (novo: 'entrar' | 'recuperar') => {
    setModo(novo);
    setErro('');
    setEnviado(false);
    setSenha('');
  };

  const campoEmail = (
    <>
      <label className="nv-label" htmlFor="login-email">
        E-mail
      </label>
      <input
        id="login-email"
        className="nv-input"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </>
  );

  return (
    <main className="painel-login">
      <Branch className="painel-login__branch painel-login__branch--tl" />
      <Branch className="painel-login__branch painel-login__branch--br" />
      <form className="painel-login__card nv-fade-up" onSubmit={modo === 'entrar' ? entrar : recuperar}>
        <p className="painel-login__monogram">
          N<span>&amp;</span>V
        </p>
        <h1 className="painel-login__title">{modo === 'entrar' ? 'Painel dos noivos' : 'Recuperar senha'}</h1>
        <Ornament className="nv-ornament" />

        {modo === 'entrar' ? (
          <>
            <p className="painel-login__lead">Entre para cuidar dos convites, recados e presentes.</p>
            {aviso && !erro && <p className="painel-alert painel-alert--info">{aviso}</p>}
            {erro && (
              <p className="painel-alert" role="alert">
                {erro}
              </p>
            )}
            {campoEmail}
            <label className="nv-label" htmlFor="login-senha">
              Senha
            </label>
            <input
              id="login-senha"
              className="nv-input"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button type="submit" className="nv-btn nv-btn--block" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" className="painel-login__esqueci" onClick={() => trocarModo('recuperar')}>
              Esqueci minha senha
            </button>
          </>
        ) : enviado ? (
          <>
            <p className="painel-alert painel-alert--info" role="status">
              Se <strong>{email}</strong> tiver acesso ao painel, enviamos um e-mail com o link para criar uma nova senha. O link vale
              por 1 hora. Confira também a caixa de spam.
            </p>
            <button type="button" className="nv-btn nv-btn--block" onClick={() => trocarModo('entrar')}>
              Voltar para o login
            </button>
          </>
        ) : (
          <>
            <p className="painel-login__lead">Informe o e-mail do seu acesso. Enviaremos um link para você criar uma nova senha.</p>
            {erro && (
              <p className="painel-alert" role="alert">
                {erro}
              </p>
            )}
            {campoEmail}
            <button type="submit" className="nv-btn nv-btn--block" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar link'}
            </button>
            <button type="button" className="painel-login__esqueci" onClick={() => trocarModo('entrar')}>
              ← Voltar para o login
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
