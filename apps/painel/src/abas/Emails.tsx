import { useState, type FormEvent } from 'react';
import { EstadoVazio } from '@nv/shared';
import { errorMessage } from '@nv/shared/api';
import type { ApelidoEmail, CaixaEmail, EmailsAdmin } from '@nv/shared/types';
import { adminApi } from '../adminApi';
import { useLoad } from '../useLoad';
import { ConfirmarModal, Modal } from '../Modal';

const carregar = () => adminApi<EmailsAdmin>('/admin/emails');
const SENHA_MINIMA = 10;
const caminho = (endereco: string) => encodeURIComponent(endereco);

// Password + confirmation, shared by "new mailbox" and "change password".
function CamposSenha({
  senha,
  confirmacao,
  onSenha,
  onConfirmacao,
}: {
  senha: string;
  confirmacao: string;
  onSenha: (v: string) => void;
  onConfirmacao: (v: string) => void;
}) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <>
      <label className="nv-label" htmlFor="email-senha">
        Senha
      </label>
      <div className="painel-senha">
        <input
          id="email-senha"
          className="nv-input"
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          value={senha}
          onChange={(e) => onSenha(e.target.value)}
        />
        <button type="button" className="painel-link" onClick={() => setMostrar((m) => !m)}>
          {mostrar ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      <label className="nv-label" htmlFor="email-confirmacao">
        Repita a senha
      </label>
      <input
        id="email-confirmacao"
        className="nv-input"
        type={mostrar ? 'text' : 'password'}
        autoComplete="new-password"
        value={confirmacao}
        onChange={(e) => onConfirmacao(e.target.value)}
      />
      <p className="painel-hint">Pelo menos {SENHA_MINIMA} caracteres, sem espaços.</p>
    </>
  );
}

const conferirSenha = (senha: string, confirmacao: string) =>
  senha.length < SENHA_MINIMA
    ? `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`
    : /\s/.test(senha)
      ? 'A senha não pode ter espaços.'
      : senha !== confirmacao
        ? 'As duas senhas não são iguais.'
        : '';

function CampoEndereco({ id, dominio, value, onChange }: { id: string; dominio: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="painel-email-endereco">
      <input
        id={id}
        className="nv-input"
        placeholder="contato"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        value={value}
        maxLength={64}
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s/g, ''))}
      />
      <span className="painel-email-endereco__dominio">@{dominio}</span>
    </div>
  );
}

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

function NovaCaixaModal({ dominio, onCriada, onFechar }: { dominio: string; onCriada: (c: CaixaEmail) => void; onFechar: () => void }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = !usuario ? 'Informe o endereço (o que vem antes do @).' : conferirSenha(senha, confirmacao);
    if (problema) return setErro(problema);
    setSalvando(true);
    setErro('');
    try {
      onCriada(await adminApi<CaixaEmail>('/admin/emails/caixas', { method: 'POST', body: { usuario, senha } }));
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Nova caixa de e-mail"
      subtitulo="Recebe e envia mensagens com este endereço. A senha é a usada no webmail e no celular."
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={rodape(salvando, onFechar, 'Criar caixa')}
    >
      <label className="nv-label" htmlFor="email-usuario">
        Endereço
      </label>
      <CampoEndereco id="email-usuario" dominio={dominio} value={usuario} onChange={setUsuario} />
      <CamposSenha senha={senha} confirmacao={confirmacao} onSenha={setSenha} onConfirmacao={setConfirmacao} />
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

function SenhaModal({ caixa, onFechar }: { caixa: CaixaEmail; onFechar: () => void }) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = conferirSenha(senha, confirmacao);
    if (problema) return setErro(problema);
    setSalvando(true);
    setErro('');
    try {
      await adminApi(`/admin/emails/caixas/${caminho(caixa.endereco)}/senha`, { method: 'PUT', body: { senha } });
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Trocar senha"
      subtitulo={caixa.endereco}
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={rodape(salvando, onFechar, 'Trocar senha')}
    >
      <CamposSenha senha={senha} confirmacao={confirmacao} onSenha={setSenha} onConfirmacao={setConfirmacao} />
      <p className="painel-hint">Depois, atualize a senha também no celular e nos programas de e-mail.</p>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

function ApelidoModal({
  apelido,
  dados,
  onSalvo,
  onFechar,
}: {
  apelido: ApelidoEmail | null; // null = new alias
  dados: EmailsAdmin;
  onSalvo: (a: ApelidoEmail) => void;
  onFechar: () => void;
}) {
  const [usuario, setUsuario] = useState(apelido ? apelido.endereco.split('@')[0] : '');
  const [destinos, setDestinos] = useState(apelido ? apelido.destinos.join('\n') : (dados.caixas[0]?.endereco ?? ''));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const lista = destinos.split(/[\s,;]+/).filter(Boolean);
    if (!usuario) return setErro('Informe o endereço do apelido.');
    if (!lista.length) return setErro('Informe para onde as mensagens vão.');
    setSalvando(true);
    setErro('');
    try {
      const salvo = await adminApi<ApelidoEmail>(apelido ? `/admin/emails/apelidos/${caminho(apelido.endereco)}` : '/admin/emails/apelidos', {
        method: apelido ? 'PUT' : 'POST',
        body: apelido ? { destinos: lista } : { usuario, destinos: lista },
      });
      onSalvo(salvo);
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={apelido ? 'Editar apelido' : 'Novo apelido'}
      subtitulo="Um endereço que não tem caixa própria: as mensagens são entregues nos destinos abaixo."
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={rodape(salvando, onFechar, apelido ? 'Salvar alterações' : 'Criar apelido')}
    >
      <label className="nv-label" htmlFor="apelido-usuario">
        Endereço
      </label>
      {apelido ? (
        <p className="painel-email-fixo">{apelido.endereco}</p>
      ) : (
        <CampoEndereco id="apelido-usuario" dominio={dados.dominio} value={usuario} onChange={setUsuario} />
      )}
      <label className="nv-label" htmlFor="apelido-destinos">
        Entregar para
      </label>
      <textarea
        id="apelido-destinos"
        className="nv-input"
        rows={3}
        placeholder={`contato@${dados.dominio}`}
        value={destinos}
        onChange={(e) => setDestinos(e.target.value)}
      />
      <p className="painel-hint">
        Um endereço por linha. Pode ser uma caixa daqui ({dados.caixas.map((c) => c.endereco).join(', ') || 'nenhuma ainda'}) ou
        um e-mail de fora, como um Gmail.
      </p>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

export function Emails() {
  const { data, setData, erro } = useLoad(carregar);
  const [novaCaixa, setNovaCaixa] = useState(false);
  const [senhaDe, setSenhaDe] = useState<CaixaEmail | null>(null);
  const [excluindoCaixa, setExcluindoCaixa] = useState<CaixaEmail | null>(null);
  const [apelidoForm, setApelidoForm] = useState<{ apelido: ApelidoEmail | null } | null>(null);
  const [excluindoApelido, setExcluindoApelido] = useState<ApelidoEmail | null>(null);

  const atualizar = (fn: (d: EmailsAdmin) => EmailsAdmin) => setData((d) => (d ? fn(d) : d));
  const porEndereco = <T extends { endereco: string }>(lista: T[]) => [...lista].sort((a, b) => a.endereco.localeCompare(b.endereco));

  return (
    <section>
      <div className="painel-section-head">
        <h2 className="painel-h2">E-mails</h2>
        {data?.disponivel && (
          <div className="painel-head-acoes">
            <button className="nv-btn-ghost" onClick={() => setApelidoForm({ apelido: null })}>
              + Novo apelido
            </button>
            <button className="nv-btn" onClick={() => setNovaCaixa(true)}>
              + Nova caixa
            </button>
          </div>
        )}
      </div>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      {!data && !erro && <p className="painel-empty">Carregando…</p>}

      {data && !data.disponivel && (
        <EstadoVazio icon="envelope" titulo="Servidor de e-mail não configurado aqui">
          As caixas @{data.dominio || 'seu domínio'} são gerenciadas no site publicado, onde o servidor de e-mail roda.
        </EstadoVazio>
      )}

      {data?.disponivel && (
        <>
          <p className="painel-hint">
            Endereços @{data.dominio}. Caixas recebem e enviam mensagens; apelidos só repassam para outras caixas ou e-mails. As
            mudanças valem em poucos segundos.
          </p>

          <h3 className="painel-h3">
            Caixas <span>· {data.caixas.length}</span>
          </h3>
          {data.caixas.length === 0 ? (
            <EstadoVazio
              icon="envelope"
              titulo="Nenhuma caixa ainda"
              acao={
                <button className="nv-btn" onClick={() => setNovaCaixa(true)}>
                  Criar a primeira caixa
                </button>
              }
            >
              Crie, por exemplo, contato@{data.dominio} para receber os e-mails do casamento.
            </EstadoVazio>
          ) : (
            <ul className="painel-list">
              {data.caixas.map((c) => (
                <li key={c.endereco} className="painel-item">
                  <div className="painel-item__main">
                    <div className="painel-item__title">
                      <strong>{c.endereco}</strong>
                    </div>
                  </div>
                  <div className="painel-item__actions">
                    <a className="painel-link" href={data.servidor.webmail} target="_blank" rel="noopener">
                      Abrir webmail
                    </a>
                    <button className="painel-link" onClick={() => setSenhaDe(c)}>
                      Trocar senha
                    </button>
                    <button className="painel-link painel-link--danger" onClick={() => setExcluindoCaixa(c)}>
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className="painel-h3 painel-email-secao">
            Apelidos <span>· {data.apelidos.length}</span>
          </h3>
          {data.apelidos.length === 0 ? (
            <EstadoVazio compacto icon="envelope" titulo="Nenhum apelido">
              Os recibos dos presentes saem como presentes@{data.dominio}: crie esse apelido para as respostas dos convidados
              chegarem numa caixa.
            </EstadoVazio>
          ) : (
            <ul className="painel-list">
              {data.apelidos.map((a) => (
                <li key={a.endereco} className="painel-item">
                  <div className="painel-item__main">
                    <div className="painel-item__title">
                      <strong>{a.endereco}</strong>
                    </div>
                    <div className="painel-item__meta">
                      <span>→ {a.destinos.join(', ')}</span>
                    </div>
                  </div>
                  <div className="painel-item__actions">
                    <button className="painel-link" onClick={() => setApelidoForm({ apelido: a })}>
                      Editar
                    </button>
                    <button className="painel-link painel-link--danger" onClick={() => setExcluindoApelido(a)}>
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="painel-card painel-email-acesso">
            <h3 className="painel-h3">Como acessar</h3>
            <p className="painel-hint">
              No navegador:{' '}
              <a href={data.servidor.webmail} target="_blank" rel="noopener">
                {data.servidor.webmail.replace(/^https?:\/\//, '')}
              </a>
              . No celular ou no Outlook/Thunderbird, adicione uma conta IMAP com estes dados (usuário = o endereço completo):
            </p>
            <dl className="painel-email-dados">
              <dt>Entrada (IMAP)</dt>
              <dd>
                {data.servidor.imap} · porta 993 · SSL/TLS
              </dd>
              <dt>Saída (SMTP)</dt>
              <dd>
                {data.servidor.smtp} · porta 587 · STARTTLS (ou 465 · SSL/TLS)
              </dd>
            </dl>
          </div>
        </>
      )}

      {novaCaixa && data && (
        <NovaCaixaModal
          dominio={data.dominio}
          onCriada={(c) => atualizar((d) => ({ ...d, caixas: porEndereco([...d.caixas, c]) }))}
          onFechar={() => setNovaCaixa(false)}
        />
      )}
      {senhaDe && <SenhaModal caixa={senhaDe} onFechar={() => setSenhaDe(null)} />}
      {excluindoCaixa && (
        <ConfirmarModal
          titulo="Excluir caixa"
          mensagem={
            <>
              Excluir <strong>{excluindoCaixa.endereco}</strong>? O endereço deixa de receber mensagens e o acesso pelo webmail e pelo
              celular para de funcionar. As mensagens já recebidas ficam guardadas no servidor.
            </>
          }
          confirmar="Excluir caixa"
          onConfirmar={async () => {
            await adminApi(`/admin/emails/caixas/${caminho(excluindoCaixa.endereco)}`, { method: 'DELETE' });
            atualizar((d) => ({ ...d, caixas: d.caixas.filter((c) => c.endereco !== excluindoCaixa.endereco) }));
          }}
          onFechar={() => setExcluindoCaixa(null)}
        />
      )}
      {apelidoForm && data && (
        <ApelidoModal
          apelido={apelidoForm.apelido}
          dados={data}
          onSalvo={(salvo) =>
            atualizar((d) => ({
              ...d,
              apelidos: porEndereco([...d.apelidos.filter((a) => a.endereco !== salvo.endereco), salvo]),
            }))
          }
          onFechar={() => setApelidoForm(null)}
        />
      )}
      {excluindoApelido && (
        <ConfirmarModal
          titulo="Excluir apelido"
          mensagem={
            <>
              Excluir <strong>{excluindoApelido.endereco}</strong>? Mensagens enviadas para ele deixam de ser entregues.
            </>
          }
          confirmar="Excluir apelido"
          onConfirmar={async () => {
            await adminApi(`/admin/emails/apelidos/${caminho(excluindoApelido.endereco)}`, { method: 'DELETE' });
            atualizar((d) => ({ ...d, apelidos: d.apelidos.filter((a) => a.endereco !== excluindoApelido.endereco) }));
          }}
          onFechar={() => setExcluindoApelido(null)}
        />
      )}
    </section>
  );
}
