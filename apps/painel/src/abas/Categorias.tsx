import { useState, type FormEvent } from 'react';
import { Icon } from '@nv/shared';
import { ICONES_CATEGORIA, iconeDaCategoria, ROTULO_ICONE, type IconeCategoria } from '@nv/shared/categorias';
import { errorMessage } from '@nv/shared/api';
import type { Categoria } from '@nv/shared/types';
import { adminApi } from '../adminApi';
import { Modal } from '../Modal';

// Create / edit a gift category: name plus an icon shown on the site.
export function CategoriaModal({
  categoria,
  onSalva,
  onFechar,
}: {
  categoria: Categoria | null; // null = new category
  onSalva: (c: Categoria) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(categoria?.nome ?? '');
  const [icone, setIcone] = useState<IconeCategoria>(categoria ? iconeDaCategoria(categoria.icone) : 'gift');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return setErro('Informe o nome da categoria.');
    setSalvando(true);
    setErro('');
    try {
      const salva = await adminApi<Categoria>(categoria ? `/admin/categorias/${categoria.id}` : '/admin/categorias', {
        method: categoria ? 'PUT' : 'POST',
        body: { nome: nome.trim(), icone },
      });
      onSalva(salva);
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={categoria ? 'Editar categoria' : 'Nova categoria'}
      subtitulo="As categorias organizam a lista de presentes no site."
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={
        <>
          <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="nv-btn" disabled={salvando}>
            {salvando ? 'Salvando…' : categoria ? 'Salvar alterações' : 'Criar categoria'}
          </button>
        </>
      }
    >
      <label className="nv-label" htmlFor="categoria-nome">
        Nome
      </label>
      <input
        id="categoria-nome"
        className="nv-input"
        placeholder="Ex.: Lua de mel"
        value={nome}
        maxLength={60}
        onChange={(e) => setNome(e.target.value)}
      />
      <span className="nv-label">Ícone</span>
      <div className="painel-icones" role="radiogroup" aria-label="Ícone da categoria">
        {ICONES_CATEGORIA.map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={icone === i}
            className={icone === i ? 'painel-icone is-active' : 'painel-icone'}
            onClick={() => setIcone(i)}
            title={ROTULO_ICONE[i]}
          >
            <Icon name={i} size={24} />
            <small>{ROTULO_ICONE[i]}</small>
          </button>
        ))}
      </div>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

// Delete a category. When it still has gifts, they move to another category first.
export function ExcluirCategoriaModal({
  categoria,
  quantidade,
  outras,
  onExcluida,
  onFechar,
}: {
  categoria: Categoria;
  quantidade: number; // gifts in this category
  outras: Categoria[];
  onExcluida: (moverPara: number | null) => void;
  onFechar: () => void;
}) {
  const [destino, setDestino] = useState<number | ''>(outras[0]?.id ?? '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const precisaMover = quantidade > 0;
  const semDestino = precisaMover && outras.length === 0;

  const excluir = async () => {
    setEnviando(true);
    setErro('');
    try {
      const query = precisaMover ? `?moverPara=${destino}` : '';
      await adminApi(`/admin/categorias/${categoria.id}${query}`, { method: 'DELETE' });
      onExcluida(precisaMover ? Number(destino) : null);
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo="Excluir categoria"
      onFechar={onFechar}
      bloqueado={enviando}
      rodape={
        <>
          <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="nv-btn painel-btn-perigo" onClick={excluir} disabled={enviando || semDestino || destino === ''}>
            {enviando ? 'Aguarde…' : precisaMover ? 'Mover e excluir' : 'Excluir categoria'}
          </button>
        </>
      }
    >
      <div className="painel-modal__mensagem">
        {!precisaMover && (
          <>
            Excluir a categoria <strong>{categoria.nome}</strong>? Ela não tem presentes.
          </>
        )}
        {precisaMover && !semDestino && (
          <>
            A categoria <strong>{categoria.nome}</strong> tem {quantidade} presente{quantidade > 1 ? 's. Para onde eles devem ir?' : '. Para onde ele deve ir?'}
          </>
        )}
        {semDestino && (
          <>
            A categoria <strong>{categoria.nome}</strong> tem {quantidade} presente{quantidade > 1 ? 's' : ''} e é a única da lista. Crie
            outra categoria para mover os presentes antes de excluí-la.
          </>
        )}
      </div>
      {precisaMover && !semDestino && (
        <>
          <label className="nv-label" htmlFor="categoria-destino">
            Mover presentes para
          </label>
          <select
            id="categoria-destino"
            className="nv-input painel-select"
            value={destino}
            onChange={(e) => setDestino(Number(e.target.value))}
          >
            {outras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
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
