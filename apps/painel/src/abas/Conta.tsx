import { useState, type FormEvent } from 'react';
import { EstadoVazio } from '@nv/shared';
import { errorMessage } from '@nv/shared/api';
import type { ConviteEnviado, Usuario, UsuarioPainel } from '@nv/shared/types';
import { adminApi, copyText, formatDate } from '../adminApi';
import { useLoad } from '../useLoad';
import { ConfirmarModal, Modal } from '../Modal';

const SENHA_MINIMA = 10;
const carregarUsuarios = () => adminApi<UsuarioPainel[]>('/admin/usuarios');

function rodape(salvando: boolean, onFechar: () => void, rotulo: string) {
  return (
    <>
      <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={salvando}>
        Cancelar
      </button>
      <button type="submit" className="nv-btn" disabled={salvando}>
        {salvando ? 'Salvando…' : rotulo}
      </button>
    </>
  );
}

function NomeModal({ usuario, onSalvo, onFechar }: { usuario: Usuario; onSalvo: (nome: string) => void; onFechar: () => void }) {
  const [nome, setNome] = useState(usuario.nome);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return setErro('Informe o nome.');
    setSalvando(true);
    setErro('');
    try {
      const r = await adminApi<{ nome: string }>('/admin/conta/nome', { method: 'PUT', body: { nome } });
      onSalvo(r.nome);
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Editar nome" subtitulo="Aparece no topo do painel e nos convites que você enviar." onFechar={onFechar} onSubmit={salvar} bloqueado={salvando} rodape={rodape(salvando, onFechar, 'Salvar nome')}>
      <label className="nv-label" htmlFor="conta-nome">
        Nome
      </label>
      <input id="conta-nome" className="nv-input" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

function SenhaModal({ usuario, onFechar, onTrocada }: { usuario: Usuario; onFechar: () => void; onTrocada: (msg: string) => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!atual) return setErro('Informe a senha atual.');
    if (nova.length < SENHA_MINIMA) return setErro(`A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (nova !== confirmacao) return setErro('As duas senhas novas não são iguais.');
    if (nova === atual) return setErro('A nova senha é igual à atual.');
    setSalvando(true);
    setErro('');
    try {
      const r = await adminApi<{ caixaAtualizada: boolean }>('/admin/conta/senha', { method: 'PUT', body: { senhaAtual: atual, senhaNova: nova } });
      onTrocada(
        r.caixaAtualizada
          ? `Senha trocada. A caixa de e-mail ${usuario.email} também passou a usar a nova senha.`
          : 'Senha trocada. Os outros aparelhos conectados saíram do painel.',
      );
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  const tipo = mostrar ? 'text' : 'password';
  return (
    <Modal titulo="Trocar senha" subtitulo={usuario.email} onFechar={onFechar} onSubmit={salvar} bloqueado={salvando} rodape={rodape(salvando, onFechar, 'Trocar senha')}>
      <label className="nv-label" htmlFor="conta-senha-atual">
        Senha atual
      </label>
      <input id="conta-senha-atual" className="nv-input" type={tipo} autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
      <label className="nv-label" htmlFor="conta-senha-nova">
        Nova senha
      </label>
      <div className="painel-senha">
        <input id="conta-senha-nova" className="nv-input" type={tipo} autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
        <button type="button" className="painel-link" onClick={() => setMostrar((m) => !m)}>
          {mostrar ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      <label className="nv-label" htmlFor="conta-senha-confirmacao">
        Repita a nova senha
      </label>
      <input id="conta-senha-confirmacao" className="nv-input" type={tipo} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
      <p className="painel-hint">
        Pelo menos {SENHA_MINIMA} caracteres. Os outros aparelhos conectados com esta conta saem do painel.
        {usuario.dono && ' Se o secret ADMIN_PASSWORD for alterado no GitHub, ele substitui esta senha no próximo deploy.'}
      </p>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

// Shows the link when the e-mail could not be sent, so the owner can share it another way.
function ResultadoConvite({ resultado }: { resultado: ConviteEnviado }) {
  const [copiado, setCopiado] = useState(false);
  return resultado.emailEnviado ? (
    <p className="painel-alert painel-alert--info" role="status">
      Convite enviado para <strong>{resultado.usuario.email}</strong>. O link vale por 7 dias.
    </p>
  ) : (
    <div className="painel-alert" role="alert">
      Não foi possível enviar o e-mail. Mande este link para {resultado.usuario.nome} por outro meio (vale por 7 dias):
      <div className="conta-link">
        <code>{resultado.link}</code>
        <button
          type="button"
          className="painel-link"
          onClick={async () => {
            if (await copyText(resultado.link)) setCopiado(true);
          }}
        >
          {copiado ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function ConvidarModal({ onConvidado, onFechar }: { onConvidado: (r: ConviteEnviado) => void; onFechar: () => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<ConviteEnviado | null>(null);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (resultado) return onFechar();
    if (!nome.trim()) return setErro('Informe o nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('Informe um e-mail válido.');
    setSalvando(true);
    setErro('');
    try {
      const r = await adminApi<ConviteEnviado>('/admin/usuarios', { method: 'POST', body: { nome: nome.trim(), email: email.trim() } });
      onConvidado(r);
      setResultado(r);
    } catch (error) {
      setErro(errorMessage(error));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Convidar usuário"
      subtitulo="A pessoa recebe um e-mail com o link para criar a própria senha e entrar no painel."
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={
        resultado ? (
          <button type="submit" className="nv-btn">
            Concluir
          </button>
        ) : (
          rodape(salvando, onFechar, 'Enviar convite')
        )
      }
    >
      {resultado ? (
        <ResultadoConvite resultado={resultado} />
      ) : (
        <>
          <label className="nv-label" htmlFor="convite-nome-usuario">
            Nome
          </label>
          <input id="convite-nome-usuario" className="nv-input" placeholder="Ex.: Mãe da noiva" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          <label className="nv-label" htmlFor="convite-email-usuario">
            E-mail
          </label>
          <input
            id="convite-email-usuario"
            className="nv-input"
            type="email"
            autoCapitalize="none"
            placeholder="pessoa@exemplo.com"
            value={email}
            maxLength={200}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="painel-hint">Quem você convidar usa o painel, menos usuários, e-mails e configurações, que ficam só com o master.</p>
          {erro && (
            <p className="painel-alert" role="alert">
              {erro}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function Usuarios({ usuario }: { usuario: Usuario }) {
  const { data: lista, setData, erro } = useLoad(carregarUsuarios);
  const [convidando, setConvidando] = useState(false);
  const [removendo, setRemovendo] = useState<UsuarioPainel | null>(null);
  const [reenvio, setReenvio] = useState<{ id: number; resultado?: ConviteEnviado; erro?: string } | null>(null);

  const reenviar = async (u: UsuarioPainel) => {
    setReenvio({ id: u.id });
    try {
      setReenvio({ id: u.id, resultado: await adminApi<ConviteEnviado>(`/admin/usuarios/${u.id}/convite`, { method: 'POST' }) });
    } catch (error) {
      setReenvio({ id: u.id, erro: errorMessage(error) });
    }
  };

  return (
    <div className="painel-card conta-usuarios">
      <div className="painel-section-head">
        <h3 className="painel-h3">
          Usuários do painel <span>· {lista?.length ?? 0}</span>
        </h3>
        <button className="nv-btn" onClick={() => setConvidando(true)}>
          + Convidar usuário
        </button>
      </div>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      {!lista && !erro && <p className="painel-empty">Carregando…</p>}
      {lista && lista.length <= 1 && (
        <EstadoVazio compacto icon="envelope" titulo="Só você tem acesso">
          Convide quem vai ajudar a cuidar do site: a pessoa recebe um e-mail para criar a senha.
        </EstadoVazio>
      )}
      <ul className="painel-list">
        {lista?.map((u) => (
          <li key={u.id} className="painel-item">
            <div className="painel-item__main">
              <div className="painel-item__title">
                <strong>{u.nome}</strong>
                {u.dono ? (
                  <span className="painel-badge painel-badge--sim">Master</span>
                ) : u.status === 'ativo' ? (
                  <span className="painel-badge painel-badge--sim">Ativo</span>
                ) : (
                  <span className="painel-badge painel-badge--pendente">Convite enviado</span>
                )}
              </div>
              <div className="painel-item__meta">
                <span>{u.email}</span>
                <span>desde {formatDate(u.criadoEm)}</span>
                {u.id === usuario.id && <span>(você)</span>}
              </div>
              {reenvio?.id === u.id && reenvio.resultado && <ResultadoConvite resultado={reenvio.resultado} />}
              {reenvio?.id === u.id && reenvio.erro && (
                <p className="painel-alert" role="alert">
                  {reenvio.erro}
                </p>
              )}
            </div>
            {!u.dono && (
              <div className="painel-item__actions">
                {u.status === 'convidado' && (
                  <button className="painel-link" onClick={() => reenviar(u)} disabled={reenvio?.id === u.id && !reenvio.resultado && !reenvio.erro}>
                    {reenvio?.id === u.id && !reenvio.resultado && !reenvio.erro ? 'Enviando…' : 'Reenviar convite'}
                  </button>
                )}
                <button className="painel-link painel-link--danger" onClick={() => setRemovendo(u)}>
                  Remover
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {convidando && <ConvidarModal onConvidado={(r) => setData((l) => [...(l ?? []), r.usuario])} onFechar={() => setConvidando(false)} />}
      {removendo && (
        <ConfirmarModal
          titulo="Remover usuário"
          mensagem={
            <>
              Remover <strong>{removendo.nome}</strong> ({removendo.email}) do painel? O acesso para na hora
              {removendo.status === 'convidado' ? ' e o link do convite deixa de funcionar' : ''}.
            </>
          }
          confirmar="Remover usuário"
          onConfirmar={async () => {
            await adminApi(`/admin/usuarios/${removendo.id}`, { method: 'DELETE' });
            setData((l) => (l ?? []).filter((x) => x.id !== removendo.id));
          }}
          onFechar={() => setRemovendo(null)}
        />
      )}
    </div>
  );
}

export function Conta({ usuario, onUsuario }: { usuario: Usuario; onUsuario: (u: Usuario) => void }) {
  const [editandoNome, setEditandoNome] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [aviso, setAviso] = useState('');

  return (
    <section>
      <h2 className="painel-h2">Minha conta</h2>
      {aviso && (
        <p className="painel-alert painel-alert--info" role="status">
          {aviso}
        </p>
      )}
      <div className="painel-card conta-dados">
        <dl className="painel-email-dados">
          <dt>Nome</dt>
          <dd>{usuario.nome}</dd>
          <dt>E-mail</dt>
          <dd>{usuario.email}</dd>
          <dt>Acesso</dt>
          <dd>{usuario.dono ? 'Usuário master (usuários, e-mails e configurações)' : 'Usuário do painel'}</dd>
        </dl>
        <div className="conta-acoes">
          <button className="nv-btn-ghost" onClick={() => setEditandoNome(true)}>
            Editar nome
          </button>
          <button className="nv-btn-ghost" onClick={() => setTrocandoSenha(true)}>
            Trocar senha
          </button>
        </div>
      </div>

      {usuario.dono && <Usuarios usuario={usuario} />}

      {editandoNome && (
        <NomeModal
          usuario={usuario}
          onSalvo={(nome) => {
            onUsuario({ ...usuario, nome });
            setAviso('Nome atualizado.');
          }}
          onFechar={() => setEditandoNome(false)}
        />
      )}
      {trocandoSenha && <SenhaModal usuario={usuario} onTrocada={setAviso} onFechar={() => setTrocandoSenha(false)} />}
    </section>
  );
}
