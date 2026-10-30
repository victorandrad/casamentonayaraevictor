import { useState, type FormEvent, type ReactNode } from 'react';
import { EstadoVazio, Icon } from '@nv/shared';
import { errorMessage, formatBRL } from '@nv/shared/api';
import { descreverTaxa, precoComTaxa, taxaDoPreco, type Taxa } from '@nv/shared/taxas';
import { iconeDaCategoria } from '@nv/shared/categorias';
import type { Categoria, Configuracoes, Presente, PresenteInput } from '@nv/shared/types';
import { adminApi } from '../adminApi';
import { useLoad } from '../useLoad';
import { Paginacao, usePaginacao } from '../Paginacao';
import { FotoUpload } from '../FotoUpload';
import { ConfirmarModal, Modal } from '../Modal';
import { CategoriaModal, ExcluirCategoriaModal } from './Categorias';
import { OrganizarLista } from './OrganizarLista';

const carregar = () => adminApi<Presente[]>('/admin/presentes');
const carregarConfig = () => adminApi<Configuracoes>('/admin/configuracoes');
const carregarCategorias = () => adminApi<Categoria[]>('/admin/categorias');

// The form edits the price in reais as text; the API stores cents.
// `tipo`: unique gift (1×), unlimited contributions (cota) or a set quantity.
type Tipo = 'unico' | 'cota' | 'limitado';
type Rascunho = { categoriaId: number; nome: string; valor: string; fotoUrl: string; tipo: Tipo; limite: string };
const vazio: Rascunho = { categoriaId: 0, nome: '', valor: '', fotoUrl: '', tipo: 'unico', limite: '2' };

function paraInput(r: Rascunho): PresenteInput | null {
  const reais = Number(r.valor.replace(/\./g, '').replace(',', '.'));
  if (!r.categoriaId || !r.nome.trim() || !Number.isFinite(reais) || reais < 0) return null;
  const limite = Math.floor(Number(r.limite));
  if (r.tipo === 'limitado' && !(limite >= 1)) return null;
  return {
    categoriaId: r.categoriaId,
    nome: r.nome.trim(),
    valorCentavos: Math.round(reais * 100),
    fotoUrl: r.fotoUrl.trim() || null,
    quantidadeMaxima: r.tipo === 'cota' ? null : r.tipo === 'unico' ? 1 : limite,
  };
}

const tipoDe = (q: number | null): Tipo => (q === null ? 'cota' : q === 1 ? 'unico' : 'limitado');

// Short status for a gift card in the panel.
function situacao(p: Presente): { texto: string; classe: string } {
  // Given on the site plus given outside it (marked here by the couple).
  const total = p.presenteados + p.foraDoSite;
  const fora = p.foraDoSite > 0 ? ` (${p.foraDoSite} fora do site)` : '';
  if (p.quantidadeMaxima === null) {
    return { texto: `Cota · ${total} contribuição(ões)${fora}`, classe: 'cota' };
  }
  if (p.quantidadeMaxima === 1) {
    if (p.presenteados >= 1) return { texto: 'Presenteado ♥', classe: 'presenteado' };
    if (p.foraDoSite >= 1) return { texto: 'Presenteado fora do site ♥', classe: 'presenteado' };
    if (p.emPagamento > 0) return { texto: 'Em pagamento', classe: 'reservado' };
    return { texto: 'Único · disponível', classe: 'disponivel' };
  }
  if (p.disponivel === 0 && total >= p.quantidadeMaxima) return { texto: `Esgotado · ${total}/${p.quantidadeMaxima}${fora}`, classe: 'presenteado' };
  const emPagamento = p.emPagamento > 0 ? ` · ${p.emPagamento} em pagamento` : '';
  return { texto: `${total} de ${p.quantidadeMaxima} presenteados${fora}${emPagamento}`, classe: p.emPagamento > 0 ? 'reservado' : 'disponivel' };
}

// Marks units given outside the site (in person, a direct transfer…). A unique gift is a yes/no; the
// others take a number (0 undoes it).
function ForaDoSiteModal({ presente, onSalvo, onFechar }: { presente: Presente; onSalvo: (p: Presente) => void; onFechar: () => void }) {
  const unico = presente.quantidadeMaxima === 1;
  const [quantidade, setQuantidade] = useState(String(unico ? (presente.foraDoSite > 0 ? 0 : 1) : presente.foraDoSite));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const limite = presente.quantidadeMaxima === null ? null : presente.quantidadeMaxima - presente.presenteados;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const n = Math.floor(Number(quantidade));
    if (!Number.isFinite(n) || n < 0) return setErro('Informe uma quantidade válida.');
    setSalvando(true);
    setErro('');
    try {
      onSalvo(await adminApi<Presente>(`/admin/presentes/${presente.id}/fora-do-site`, { method: 'PUT', body: { quantidade: n } }));
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Presenteado fora do site"
      subtitulo={presente.nome}
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={
        <>
          <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="nv-btn" disabled={salvando}>
            {salvando ? 'Salvando…' : unico ? (presente.foraDoSite > 0 ? 'Desmarcar' : 'Marcar como presenteado') : 'Salvar'}
          </button>
        </>
      }
    >
      {unico ? (
        <p className="painel-hint">
          {presente.foraDoSite > 0
            ? 'Este presente está marcado como dado fora do site. Desmarcar faz ele voltar para a lista do site.'
            : 'Alguém já deu este presente por fora (em mãos, transferência…)? Marcando, ele sai da lista do site e ninguém mais consegue pagar por ele.'}
        </p>
      ) : (
        <>
          <p className="painel-hint">
            Quantas unidades foram dadas fora do site (em mãos, transferência…)? Elas contam como presenteadas
            {limite !== null ? ` e saem da lista do site (até ${limite}, descontando o que já foi pago pelo site)` : ''}. Use 0 para desfazer.
          </p>
          <div className="painel-campo">
            <label className="nv-label" htmlFor="fora-quantidade">
              Unidades dadas fora do site
            </label>
            <input
              id="fora-quantidade"
              className="nv-input"
              type="number"
              min={0}
              max={limite ?? 1000}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </div>
        </>
      )}
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

const centavosDoRascunho = (r: Rascunho) => {
  const reais = Number(r.valor.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(reais) && reais > 0 ? Math.round(reais * 100) : 0;
};

// Live breakdown under the form: what the guest pays for the typed value.
function PrevisaoTaxa({ valorCentavos, taxa }: { valorCentavos: number; taxa: Taxa | null }) {
  if (taxa === null) return null;
  if (!valorCentavos) {
    return <p className="painel-taxa-preview">Digite quanto vocês querem receber; somamos {descreverTaxa(taxa)} de taxa para o convidado.</p>;
  }
  return (
    <p className="painel-taxa-preview">
      Vocês recebem <strong>{formatBRL(valorCentavos)}</strong> · taxa ({descreverTaxa(taxa)}):{' '}
      {formatBRL(taxaDoPreco(valorCentavos, taxa))} · o convidado paga{' '}
      <strong>{formatBRL(precoComTaxa(valorCentavos, taxa))}</strong>
    </p>
  );
}

const paraRascunho = (p: Presente): Rascunho => ({
  categoriaId: p.categoriaId,
  nome: p.nome,
  valor: String(p.valorCentavos / 100).replace('.', ','),
  fotoUrl: p.fotoUrl ?? '',
  tipo: tipoDe(p.quantidadeMaxima),
  limite: String(p.quantidadeMaxima && p.quantidadeMaxima > 1 ? p.quantidadeMaxima : 2),
});

function PresenteForm({ value, categorias, onChange }: { value: Rascunho; categorias: Categoria[]; onChange: (r: Rascunho) => void }) {
  return (
    <div className="painel-modal__campos">
      <div className="painel-campo painel-campo--inteiro">
        <label className="nv-label" htmlFor="presente-nome">Presente</label>
        <input id="presente-nome" className="nv-input" value={value.nome} maxLength={120} placeholder="Ex.: Jogo de taças" onChange={(e) => onChange({ ...value, nome: e.target.value })} />
      </div>
      <div className="painel-campo">
        <label className="nv-label" htmlFor="presente-categoria">Categoria</label>
        <select id="presente-categoria" className="nv-input painel-select" value={value.categoriaId} onChange={(e) => onChange({ ...value, categoriaId: Number(e.target.value) })}>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="painel-campo">
        <label className="nv-label" htmlFor="presente-valor">Vocês recebem (R$)</label>
        <input id="presente-valor" className="nv-input" inputMode="decimal" value={value.valor} placeholder="150" onChange={(e) => onChange({ ...value, valor: e.target.value })} />
      </div>
      <div className={value.tipo === 'limitado' ? 'painel-campo' : 'painel-campo painel-campo--inteiro'}>
        <label className="nv-label" htmlFor="presente-tipo">Pode ser presenteado</label>
        <select id="presente-tipo" className="nv-input painel-select" value={value.tipo} onChange={(e) => onChange({ ...value, tipo: e.target.value as Tipo })}>
          <option value="unico">1 vez (presente único)</option>
          <option value="cota">Quantas vezes quiserem (cota)</option>
          <option value="limitado">Quantidade definida…</option>
        </select>
      </div>
      {value.tipo === 'limitado' && (
        <div className="painel-campo">
          <label className="nv-label" htmlFor="presente-limite">Quantidade</label>
          <input id="presente-limite" className="nv-input" type="number" min={1} max={1000} value={value.limite} onChange={(e) => onChange({ ...value, limite: e.target.value })} />
        </div>
      )}
      <div className="painel-campo painel-campo--inteiro">
        <span className="nv-label">Foto (opcional)</span>
        <FotoUpload value={value.fotoUrl} onChange={(fotoUrl) => onChange({ ...value, fotoUrl })} />
      </div>
    </div>
  );
}

// Create / edit a gift in a modal, with the live fee preview.
function PresenteModal({
  presente,
  categoriaInicial,
  categorias,
  taxa,
  onSalvo,
  onFechar,
}: {
  presente: Presente | null; // null = new gift
  categoriaInicial: number;
  categorias: Categoria[];
  taxa: Taxa | null;
  onSalvo: (p: Presente) => void;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<Rascunho>(presente ? paraRascunho(presente) : { ...vazio, categoriaId: categoriaInicial });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const body = paraInput(dados);
    if (!body) return setErro('Informe a categoria, o nome, um valor válido e, se for o caso, a quantidade.');
    setSalvando(true);
    setErro('');
    try {
      const salvo = await adminApi<Presente>(presente ? `/admin/presentes/${presente.id}` : '/admin/presentes', {
        method: presente ? 'PUT' : 'POST',
        body,
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
      titulo={presente ? 'Editar presente' : 'Novo presente'}
      subtitulo="Cadastre o valor que vocês querem receber; a taxa é somada no site."
      largura="larga"
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={
        <>
          <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="nv-btn" disabled={salvando}>
            {salvando ? 'Salvando…' : presente ? 'Salvar alterações' : 'Adicionar presente'}
          </button>
        </>
      }
    >
      <PresenteForm value={dados} categorias={categorias} onChange={setDados} />
      <PrevisaoTaxa valorCentavos={centavosDoRascunho(dados)} taxa={taxa} />
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

// One gift category with its actions and its own pagination.
function GrupoPaginado({
  categoria,
  itens,
  primeira,
  ultima,
  onAdicionar,
  onEditar,
  onExcluir,
  onMover,
  children,
}: {
  categoria: Categoria;
  itens: Presente[];
  primeira: boolean;
  ultima: boolean;
  onAdicionar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
  onMover: (direcao: -1 | 1) => void;
  children: (p: Presente) => ReactNode;
}) {
  const paginacao = usePaginacao(itens, { porPaginaInicial: 12 });
  return (
    <div className="painel-group">
      <div className="painel-categoria">
        <h3 className="painel-h3 painel-categoria__titulo">
          <span className="painel-categoria__icone">
            <Icon name={iconeDaCategoria(categoria.icone)} size={20} />
          </span>
          {categoria.nome} <span>· {itens.length}</span>
        </h3>
        <div className="painel-categoria__acoes">
          <button className="painel-link" onClick={() => onMover(-1)} disabled={primeira} aria-label={`Mover ${categoria.nome} para cima`} title="Mover para cima">
            ↑
          </button>
          <button className="painel-link" onClick={() => onMover(1)} disabled={ultima} aria-label={`Mover ${categoria.nome} para baixo`} title="Mover para baixo">
            ↓
          </button>
          <button className="painel-link" onClick={onAdicionar}>
            + Presente
          </button>
          <button className="painel-link" onClick={onEditar}>
            Editar
          </button>
          <button className="painel-link painel-link--danger" onClick={onExcluir}>
            Excluir
          </button>
        </div>
      </div>
      {itens.length === 0 && (
        <EstadoVazio
          compacto
          icon={iconeDaCategoria(categoria.icone)}
          titulo={`Nenhum presente em “${categoria.nome}”`}
          acao={
            <button className="painel-link" onClick={onAdicionar}>
              + Adicionar presente nesta categoria
            </button>
          }
        >
          Categorias sem presentes não aparecem no site.
        </EstadoVazio>
      )}
      <ul className="painel-list painel-presentes-grid">{paginacao.visiveis.map(children)}</ul>
      <Paginacao {...paginacao} rotulo="presentes" tamanhos={[12, 24, 48]} />
    </div>
  );
}

export function Presentes() {
  const { data: presentes, setData, erro } = useLoad(carregar);
  const { data: config } = useLoad(carregarConfig);
  const { data: categorias, setData: setCategorias, erro: erroCategorias, setErro: setErroCategorias } = useLoad(carregarCategorias);
  const taxa = config?.taxa ?? null;
  // Which modal is open: create (in a category), edit a gift, or confirm removing one
  const [formulario, setFormulario] = useState<{ presente: Presente | null; categoriaId: number } | null>(null);
  const [removendo, setRemovendo] = useState<Presente | null>(null);
  const [foraDoSite, setForaDoSite] = useState<Presente | null>(null);
  // Category modals: create/edit and delete
  const [categoriaForm, setCategoriaForm] = useState<{ categoria: Categoria | null } | null>(null);
  const [excluindoCategoria, setExcluindoCategoria] = useState<Categoria | null>(null);
  // Drag-and-drop mode: reorder categories and move gifts between them
  const [organizando, setOrganizando] = useState(false);

  const novoPresente = (categoriaId = categorias?.[0]?.id ?? 0) => setFormulario({ presente: null, categoriaId });

  const aoSalvarCategoria = (salva: Categoria) =>
    setCategorias((list) => {
      const atual = list ?? [];
      return atual.some((c) => c.id === salva.id) ? atual.map((c) => (c.id === salva.id ? salva : c)) : [...atual, salva];
    });

  const aoExcluirCategoria = (id: number, moverPara: number | null) => {
    setCategorias((list) => (list ?? []).filter((c) => c.id !== id));
    if (moverPara) setData((list) => (list ?? []).map((p) => (p.categoriaId === id ? { ...p, categoriaId: moverPara } : p)));
  };

  // Swap a category with its neighbour and save the new order.
  const moverCategoria = async (id: number, direcao: -1 | 1) => {
    if (!categorias) return;
    const i = categorias.findIndex((c) => c.id === id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= categorias.length) return;
    const nova = [...categorias];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setCategorias(nova);
    try {
      setCategorias(await adminApi<Categoria[]>('/admin/categorias/ordem', { method: 'PUT', body: { ids: nova.map((c) => c.id) } }));
    } catch (error) {
      setCategorias(categorias);
      setErroCategorias(errorMessage(error));
    }
  };

  const aoSalvar = (salvo: Presente) =>
    setData((list) => {
      const atual = list ?? [];
      return atual.some((p) => p.id === salvo.id) ? atual.map((p) => (p.id === salvo.id ? salvo : p)) : [...atual, salvo];
    });

  const remover = async (p: Presente) => {
    await adminApi(`/admin/presentes/${p.id}`, { method: 'DELETE' });
    setData((list) => (list ?? []).filter((x) => x.id !== p.id));
  };

  return (
    <section>
      <div className="painel-section-head">
        <h2 className="painel-h2">Lista de presentes</h2>
        <div className="painel-head-acoes">
          {!organizando && categorias && categorias.length > 0 && presentes && (
            <button className="nv-btn-ghost" onClick={() => setOrganizando(true)}>
              ⠿ Organizar lista
            </button>
          )}
          <button className="nv-btn-ghost" onClick={() => setCategoriaForm({ categoria: null })}>
            + Nova categoria
          </button>
          {categorias && categorias.length > 0 && (
            <button className="nv-btn" onClick={() => novoPresente()}>
              + Novo presente
            </button>
          )}
        </div>
      </div>
      <p className="painel-hint">
        Cadastre o valor que vocês querem receber. O site mostra o presente com a taxa de pagamento já somada
        {taxa !== null && ` (${descreverTaxa(taxa)}, ajustável em Configurações)`}.
      </p>
      {(erro || erroCategorias) && (
        <p className="painel-alert" role="alert">
          {erro || erroCategorias}
        </p>
      )}
      {(!presentes || !categorias) && !erro && !erroCategorias && <p className="painel-empty">Carregando…</p>}

      {categorias?.length === 0 && (
        <EstadoVazio
          icon="gift"
          titulo="Crie a primeira categoria"
          acao={
            <button className="nv-btn" onClick={() => setCategoriaForm({ categoria: null })}>
              Criar categoria
            </button>
          }
        >
          Organize a lista em categorias (por exemplo, “Chá-Bar”, “Para o nosso lar” ou “Lua de mel”) e depois cadastre os presentes em cada uma.
        </EstadoVazio>
      )}

      {categorias && categorias.length > 0 && presentes?.length === 0 && (
        <EstadoVazio
          icon="gift"
          titulo="A lista de presentes está vazia"
          acao={
            <button className="nv-btn" onClick={() => novoPresente()}>
              Cadastrar o primeiro presente
            </button>
          }
        >
          Enquanto não houver presentes, o site mostra aos convidados que a lista está sendo preparada.
        </EstadoVazio>
      )}

      {organizando && presentes && categorias && (
        <OrganizarLista
          categorias={categorias}
          presentes={presentes}
          onSalvo={(dados) => {
            setCategorias(dados.categorias);
            setData(dados.presentes);
          }}
          onConcluir={() => setOrganizando(false)}
        />
      )}

      {!organizando &&
        presentes &&
        categorias &&
        presentes.length > 0 &&
        categorias.map((categoria, i) => (
          <GrupoPaginado
            key={categoria.id}
            categoria={categoria}
            itens={presentes.filter((p) => p.categoriaId === categoria.id)}
            primeira={i === 0}
            ultima={i === categorias.length - 1}
            onAdicionar={() => novoPresente(categoria.id)}
            onEditar={() => setCategoriaForm({ categoria })}
            onExcluir={() => setExcluindoCategoria(categoria)}
            onMover={(direcao) => moverCategoria(categoria.id, direcao)}
          >
            {(p) => (
              <li key={p.id} className="painel-presente">
                <div className="painel-presente__foto">
                  {p.fotoUrl ? <img src={p.fotoUrl} alt="" loading="lazy" /> : <Icon name="camera" size={26} />}
                </div>
                <div className="painel-presente__corpo">
                  <span className={`painel-presente__situacao is-${situacao(p).classe}`}>{situacao(p).texto}</span>
                  <strong className="painel-presente__nome">{p.nome}</strong>
                  <p className="painel-presente__recebem">
                    Recebem <span>{formatBRL(p.valorCentavos)}</span>
                  </p>
                  {taxa !== null && (
                    <p className="painel-presente__paga">
                      Convidado paga <strong>{formatBRL(precoComTaxa(p.valorCentavos, taxa))}</strong>
                      <small> (+{formatBRL(taxaDoPreco(p.valorCentavos, taxa))})</small>
                    </p>
                  )}
                </div>
                <div className="painel-presente__acoes">
                  <button className="painel-link" onClick={() => setFormulario({ presente: p, categoriaId: p.categoriaId })}>
                    Editar
                  </button>
                  <button className="painel-link" onClick={() => setForaDoSite(p)}>
                    Fora do site
                  </button>
                  <button className="painel-link painel-link--danger" onClick={() => setRemovendo(p)}>
                    Remover
                  </button>
                </div>
              </li>
            )}
          </GrupoPaginado>
        ))}

      {formulario && (
        <PresenteModal
          presente={formulario.presente}
          categoriaInicial={formulario.categoriaId}
          categorias={categorias ?? []}
          taxa={taxa}
          onSalvo={aoSalvar}
          onFechar={() => setFormulario(null)}
        />
      )}
      {categoriaForm && (
        <CategoriaModal categoria={categoriaForm.categoria} onSalva={aoSalvarCategoria} onFechar={() => setCategoriaForm(null)} />
      )}
      {excluindoCategoria && (
        <ExcluirCategoriaModal
          categoria={excluindoCategoria}
          quantidade={(presentes ?? []).filter((p) => p.categoriaId === excluindoCategoria.id).length}
          outras={(categorias ?? []).filter((c) => c.id !== excluindoCategoria.id)}
          onExcluida={(moverPara) => aoExcluirCategoria(excluindoCategoria.id, moverPara)}
          onFechar={() => setExcluindoCategoria(null)}
        />
      )}
      {foraDoSite && <ForaDoSiteModal presente={foraDoSite} onSalvo={aoSalvar} onFechar={() => setForaDoSite(null)} />}
      {removendo && (
        <ConfirmarModal
          titulo="Remover presente"
          mensagem={
            <>
              Remover <strong>{removendo.nome}</strong> da lista de presentes?
              {removendo.presenteados > 0 && ' Os pagamentos já recebidos continuam registrados em Recebidos.'}
            </>
          }
          confirmar="Remover presente"
          onConfirmar={() => remover(removendo)}
          onFechar={() => setRemovendo(null)}
        />
      )}
    </section>
  );
}
