import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '@nv/shared/api';
import type { AplicacaoMercadoPagoInput, ContaMercadoPago as Situacao, CredenciaisMercadoPagoInput } from '@nv/shared/types';
import { adminApi, formatDate } from './adminApi';
import { useLoad } from './useLoad';
import { ConfirmarModal } from './Modal';

const carregar = () => adminApi<Situacao>('/admin/mercadopago');

// What Mercado Pago's return (/api/admin/mercadopago/retorno) says, in ?mercadopago= on the panel URL.
const RESULTADOS: Record<string, { texto: string; info?: boolean }> = {
  conectado: { texto: 'Conta do Mercado Pago conectada. Os presentes já podem ser pagos.', info: true },
  cancelado: { texto: 'A conexão com o Mercado Pago foi cancelada. Nada mudou.', info: true },
  erro: { texto: 'Não foi possível conectar ao Mercado Pago. Tente de novo em instantes.' },
};

function lerResultado(): string | null {
  const valor = new URLSearchParams(location.search).get('mercadopago');
  return valor && valor in RESULTADOS ? valor : null;
}

// Registers the Mercado Pago application (done once). The API checks the pair with Mercado Pago before saving.
function FormAplicacao({
  situacao,
  onSalva,
  onCancelar,
}: {
  situacao: Situacao;
  onSalva: (s: Situacao) => void;
  onCancelar?: () => void;
}) {
  const [dados, setDados] = useState<AplicacaoMercadoPagoInput>({ clientId: situacao.aplicacao?.clientId ?? '', clientSecret: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      onSalva(
        await adminApi<Situacao>('/admin/mercadopago/aplicacao', {
          method: 'PUT',
          body: { clientId: dados.clientId.trim(), clientSecret: dados.clientSecret.trim() },
        }),
      );
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(situacao.urlDeRetorno);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard blocked: the URL is on screen to copy by hand
    }
  };

  const trocando = situacao.aplicacao !== null;

  return (
    <form className="painel-mp__form" onSubmit={salvar}>
      <p className="painel-hint">
        {trocando
          ? 'Cole as credenciais da outra aplicação. Se for uma aplicação diferente, a conta conectada é desconectada e é preciso conectar de novo.'
          : 'Primeiro, cadastre o site no Mercado Pago (uma vez só). É a aplicação que a conta de vocês vai autorizar:'}
      </p>
      {!trocando && (
        <ol className="painel-mp__passos">
          <li>
            Em{' '}
            <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noopener noreferrer">
              Suas integrações
            </a>
            , clique em <strong>Criar aplicação</strong>: pagamentos on-line, produto <strong>Checkout Pro</strong>.
          </li>
          <li>
            Nos detalhes da aplicação, em <strong>URLs de redirecionamento</strong>, cadastre o endereço abaixo e ative o{' '}
            <strong>PKCE</strong>:
            <span className="painel-mp__url">
              <code>{situacao.urlDeRetorno}</code>
              <button type="button" className="painel-link" onClick={copiar}>
                {copiado ? '✓ Copiado' : 'Copiar'}
              </button>
            </span>
          </li>
          <li>
            Em <strong>Credenciais de produção</strong>, copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> para cá.
          </li>
        </ol>
      )}
      <div className="painel-form-row">
        <div className="painel-field">
          <label className="nv-label" htmlFor="mp-client-id">
            Client ID
          </label>
          <input
            id="mp-client-id"
            className="nv-input"
            inputMode="numeric"
            autoComplete="off"
            value={dados.clientId}
            onChange={(e) => setDados({ ...dados, clientId: e.target.value })}
            required
          />
        </div>
        <div className="painel-field">
          <label className="nv-label" htmlFor="mp-client-secret">
            Client Secret
          </label>
          <input
            id="mp-client-secret"
            className="nv-input"
            type="password"
            autoComplete="off"
            value={dados.clientSecret}
            onChange={(e) => setDados({ ...dados, clientSecret: e.target.value })}
            required
          />
        </div>
      </div>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      <div className="painel-mp__acoes">
        <button type="submit" className="nv-btn" disabled={salvando}>
          {salvando ? 'Conferindo com o Mercado Pago…' : 'Salvar aplicação'}
        </button>
        {onCancelar && (
          <button type="button" className="nv-btn-ghost" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

// The other way in: the Public Key and Access Token from the application's credentials (test or
// production), no OAuth. Handy for testing with the test credentials. The API checks the token with
// Mercado Pago and keeps it encrypted.
function FormCredenciais({ onSalva, onCancelar }: { onSalva: (s: Situacao) => void; onCancelar: () => void }) {
  const [dados, setDados] = useState<CredenciaisMercadoPagoInput>({ publicKey: '', accessToken: '', producao: false });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      onSalva(
        await adminApi<Situacao>('/admin/mercadopago/credenciais', {
          method: 'PUT',
          body: { publicKey: dados.publicKey.trim(), accessToken: dados.accessToken.trim(), producao: dados.producao },
        }),
      );
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <form className="painel-mp__form" onSubmit={salvar}>
      <p className="painel-hint">
        Em{' '}
        <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noopener noreferrer">
          Suas integrações
        </a>
        , abra a aplicação e copie a <strong>Public Key</strong> e o <strong>Access Token</strong> das{' '}
        <strong>Credenciais de teste</strong> (para testar) ou <strong>de produção</strong> (para receber de verdade). O valor
        cai na conta dona dessas credenciais.
      </p>
      <div className="painel-form-row">
        <div className="painel-field">
          <label className="nv-label" htmlFor="mp-public-key">
            Public Key
          </label>
          <input
            id="mp-public-key"
            className="nv-input"
            autoComplete="off"
            value={dados.publicKey}
            onChange={(e) => setDados({ ...dados, publicKey: e.target.value })}
            required
          />
        </div>
        <div className="painel-field">
          <label className="nv-label" htmlFor="mp-access-token">
            Access Token
          </label>
          <input
            id="mp-access-token"
            className="nv-input"
            type="password"
            autoComplete="off"
            value={dados.accessToken}
            onChange={(e) => setDados({ ...dados, accessToken: e.target.value })}
            required
          />
        </div>
        <div className="painel-field painel-field--sm">
          <label className="nv-label" htmlFor="mp-ambiente">
            São credenciais de
          </label>
          <select
            id="mp-ambiente"
            className="nv-input painel-select"
            value={dados.producao ? 'producao' : 'teste'}
            onChange={(e) => setDados({ ...dados, producao: e.target.value === 'producao' })}
          >
            <option value="teste">Teste</option>
            <option value="producao">Produção</option>
          </select>
        </div>
      </div>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      <div className="painel-mp__acoes">
        <button type="submit" className="nv-btn" disabled={salvando}>
          {salvando ? 'Conferindo com o Mercado Pago…' : 'Usar estas credenciais'}
        </button>
        <button type="button" className="nv-btn-ghost" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// "Conectar ao Mercado Pago": the account that receives the gifts, linked with one click (OAuth),
// after the application is registered once.
export function ContaMercadoPago() {
  const { data, setData, erro, setErro } = useLoad(carregar);
  const [resultado, setResultado] = useState(lerResultado);
  const [indo, setIndo] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [trocandoAplicacao, setTrocandoAplicacao] = useState(false);
  const [usandoCredenciais, setUsandoCredenciais] = useState(false);

  // Coming back from Mercado Pago: drop ?mercadopago from the URL so a reload doesn't repeat the note.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('mercadopago')) return;
    const url = new URL(location.href);
    url.searchParams.delete('mercadopago');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);

  const conectar = async () => {
    setResultado(null);
    setIndo(true);
    setErro('');
    try {
      const { url } = await adminApi<{ url: string }>('/admin/mercadopago/conectar', { method: 'POST' });
      location.href = url;
    } catch (error) {
      setErro(errorMessage(error));
      setIndo(false);
    }
  };

  const conta = data?.conta;
  const aviso = resultado ? RESULTADOS[resultado] : null;
  const editandoAplicacao = data && !usandoCredenciais && (trocandoAplicacao || (!data.aplicacao && !conta));

  const linkCredenciais = (
    <p className="painel-mp__aplicacao">
      Para testar, ou sem conectar pelo botão:{' '}
      <button className="painel-link" onClick={() => setUsandoCredenciais(true)}>
        usar a Public Key e o Access Token da aplicação
      </button>
    </p>
  );

  const linhaAplicacao = data?.aplicacao && (
    <p className="painel-mp__aplicacao">
      Aplicação do Mercado Pago: Client ID <code>{data.aplicacao.clientId}</code> ·{' '}
      <button className="painel-link" onClick={() => setTrocandoAplicacao(true)}>
        Alterar
      </button>
    </p>
  );

  return (
    <div className="painel-card painel-narrow">
      <h3 className="painel-h3">Recebimento dos presentes</h3>
      {aviso && (
        <p className={aviso.info ? 'painel-alert painel-alert--info' : 'painel-alert'} role="status">
          {aviso.texto}
        </p>
      )}
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      {!data && !erro && <p className="painel-hint">Carregando…</p>}

      {data && usandoCredenciais && (
        <FormCredenciais
          onSalva={(s) => {
            setData(s);
            setUsandoCredenciais(false);
            setResultado(null);
          }}
          onCancelar={() => setUsandoCredenciais(false)}
        />
      )}

      {editandoAplicacao && (
        <FormAplicacao
          situacao={data}
          onSalva={(s) => {
            setData(s);
            setTrocandoAplicacao(false);
            setResultado(null);
          }}
          onCancelar={data.aplicacao ? () => setTrocandoAplicacao(false) : undefined}
        />
      )}
      {editandoAplicacao && !data.aplicacao && linkCredenciais}

      {data && !editandoAplicacao && !usandoCredenciais && !conta && (
        <>
          <p className="painel-hint">
            Os convidados pagam com <strong>Pix</strong> ou <strong>cartão em até 12x</strong> no ambiente seguro do Mercado
            Pago, e o valor cai direto na conta de vocês. Conecte a conta que vai receber: vocês entram no Mercado Pago,
            autorizam o site e voltam para cá. Nenhuma senha fica com o site.
          </p>
          <p className="painel-mp__aviso">Enquanto nenhuma conta estiver conectada, o site não aceita pagamentos.</p>
          <button className="nv-btn painel-mp__botao" onClick={conectar} disabled={indo}>
            {indo ? 'Abrindo o Mercado Pago…' : 'Conectar ao Mercado Pago'}
          </button>
          {linhaAplicacao}
          {linkCredenciais}
        </>
      )}

      {data && !editandoAplicacao && !usandoCredenciais && conta && (
        <>
          {conta.precisaReconectar && (
            <p className="painel-alert" role="alert">
              O pagamento agora acontece dentro do site e precisa de uma autorização nova do Mercado Pago. Clique em
              “Conectar de novo” e entre com a mesma conta: até lá, o site não aceita pagamentos.
            </p>
          )}
          <div className="painel-mp__conta">
            <span className={conta.precisaReconectar ? 'painel-badge painel-badge--pendente' : 'painel-badge painel-badge--sim'}>
              {conta.precisaReconectar ? 'Reconectar' : 'Conectada'}
            </span>
            {!conta.producao && <span className="painel-badge painel-badge--pendente">Conta de teste</span>}
            {conta.origem === 'credenciais' && <span className="painel-badge painel-badge--pendente">Credenciais da aplicação</span>}
            <strong>{conta.apelido ?? conta.email ?? `Conta ${conta.usuarioId}`}</strong>
            {conta.email && conta.apelido && <span>{conta.email}</span>}
          </div>
          <p className="painel-hint">
            Os convidados pagam com Pix ou cartão em até 12x dentro do site, pelo Mercado Pago, e o valor cai nesta conta. Conectada em{' '}
            {formatDate(conta.conectadaEm)}
            {conta.conectadaPor ? ` por ${conta.conectadaPor}` : ''}.
            {conta.origem === 'oauth' ? ' A autorização é renovada sozinha.' : ' Ligada pelas credenciais coladas aqui, que não vencem.'}
            {!conta.producao && ' Esta é uma conta de teste: nenhum pagamento é real.'}
          </p>
          <div className="painel-mp__acoes">
            {conta.origem === 'credenciais' ? (
              <button className="nv-btn-ghost" onClick={() => setUsandoCredenciais(true)}>
                Trocar credenciais
              </button>
            ) : (
              <button className="nv-btn-ghost" onClick={conectar} disabled={indo}>
                {indo ? 'Abrindo o Mercado Pago…' : conta.precisaReconectar ? 'Conectar de novo' : 'Trocar de conta'}
              </button>
            )}
            {conta.origem === 'credenciais' && data.aplicacao && (
              <button className="nv-btn-ghost" onClick={conectar} disabled={indo}>
                {indo ? 'Abrindo o Mercado Pago…' : 'Conectar pelo botão'}
              </button>
            )}
            <button className="painel-link painel-link--danger" onClick={() => setDesconectando(true)}>
              Desconectar
            </button>
          </div>
          {linhaAplicacao}
        </>
      )}

      {data?.ultimoErro && (
        <details className="painel-mp__erro">
          <summary>Último erro do Mercado Pago · {new Date(data.ultimoErro.quando).toLocaleString('pt-BR')}</summary>
          <p>
            {data.ultimoErro.status ? `HTTP ${data.ultimoErro.status}` : 'Sem chamada'} em <code>{data.ultimoErro.caminho}</code>
            {data.ultimoErro.codigo && (
              <>
                {' '}· <code>{data.ultimoErro.codigo}</code>
              </>
            )}
            {data.ultimoErro.mensagem && <> · {data.ultimoErro.mensagem}</>}
          </p>
        </details>
      )}

      {desconectando && (
        <ConfirmarModal
          titulo="Desconectar o Mercado Pago"
          mensagem={
            <>
              Desconectar a conta <strong>{conta?.apelido ?? conta?.email ?? conta?.usuarioId}</strong>? O site para de aceitar
              pagamentos até uma conta ser conectada de novo. Os pagamentos já recebidos continuam em Recebidos.
            </>
          }
          confirmar="Desconectar"
          onConfirmar={async () => {
            await adminApi('/admin/mercadopago', { method: 'DELETE' });
            setResultado(null);
            setData((atual) => (atual ? { ...atual, conta: null } : atual));
          }}
          onFechar={() => setDesconectando(false)}
        />
      )}
    </div>
  );
}
