import { useState, type FormEvent } from 'react';
import { Branch, Ornament } from '@nv/shared';
import { api, errorMessage } from '@nv/shared/api';
import type { LoginInput, Usuario } from '@nv/shared/types';

export function Login({ aviso, onEntrar }: { aviso?: string; onEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
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

  return (
    <main className="painel-login">
      <Branch className="painel-login__branch painel-login__branch--tl" />
      <Branch className="painel-login__branch painel-login__branch--br" />
      <form className="painel-login__card nv-fade-up" onSubmit={entrar}>
        <p className="painel-login__monogram">
          N<span>&amp;</span>V
        </p>
        <h1 className="painel-login__title">Painel dos noivos</h1>
        <Ornament className="nv-ornament" />
        <p className="painel-login__lead">Entre para cuidar dos convites, recados e presentes.</p>

        {aviso && !erro && <p className="painel-alert painel-alert--info">{aviso}</p>}
        {erro && (
          <p className="painel-alert" role="alert">
            {erro}
          </p>
        )}

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
        <a className="painel-login__back" href="/">
          ← Voltar para o site
        </a>
      </form>
    </main>
  );
}
