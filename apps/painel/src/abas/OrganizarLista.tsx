import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '@nv/shared';
import { errorMessage, formatBRL } from '@nv/shared/api';
import { iconeDaCategoria } from '@nv/shared/categorias';
import type { Categoria, OrganizacaoLista, Presente } from '@nv/shared/types';
import { adminApi } from '../adminApi';

// Drag ids: categories are "c:<id>", gifts "p:<id>", a category's gift area "l:<id>".
const idCategoria = (id: number) => `c:${id}`;
const idPresente = (id: number) => `p:${id}`;
const idArea = (id: number) => `l:${id}`;
const tipo = (id: UniqueIdentifier) => String(id).slice(0, 1);
const numero = (id: UniqueIdentifier) => Number(String(id).slice(2));

type Layout = { ordem: number[]; itens: Record<number, number[]> };

const layoutDe = (categorias: Categoria[], presentes: Presente[]): Layout => ({
  ordem: categorias.map((c) => c.id),
  itens: Object.fromEntries(categorias.map((c) => [c.id, presentes.filter((p) => p.categoriaId === c.id).map((p) => p.id)])),
});

// Categories only collide with categories; gifts prefer the gift under the
// pointer, then the category area under it (works for empty categories).
const deteccao: CollisionDetection = (args) => {
  if (tipo(args.active.id) === 'c') {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => tipo(c.id) === 'c') });
  }
  const alvos = args.droppableContainers.filter((c) => tipo(c.id) !== 'c');
  const sob = pointerWithin({ ...args, droppableContainers: alvos });
  const presente = sob.find((c) => tipo(c.id) === 'p');
  if (presente) return [presente];
  if (sob.length) return sob;
  return closestCorners({ ...args, droppableContainers: alvos });
};

export function OrganizarLista({
  categorias,
  presentes,
  onSalvo,
  onConcluir,
}: {
  categorias: Categoria[];
  presentes: Presente[];
  onSalvo: (dados: { categorias: Categoria[]; presentes: Presente[] }) => void;
  onConcluir: () => void;
}) {
  const [layout, setLayout] = useState<Layout>(() => layoutDe(categorias, presentes));
  const [ativo, setAtivo] = useState<UniqueIdentifier | null>(null);
  const [recolhidas, setRecolhidas] = useState(false);
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo'>('');
  const [erro, setErro] = useState('');
  // Layout when the drag started, to undo a failed save.
  const antes = useRef<Layout>(layout);
  const layoutAtual = useRef(layout);
  layoutAtual.current = layout;

  const porId = useMemo(() => new Map(presentes.map((p) => [p.id, p])), [presentes]);
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  // Mouse drags right away; on touch screens press and hold, so swiping still scrolls the page.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const categoriaDoPresente = (l: Layout, presenteId: number) => l.ordem.find((c) => l.itens[c].includes(presenteId));

  const salvar = async (novo: Layout) => {
    setEstado('salvando');
    setErro('');
    const corpo: OrganizacaoLista = novo.ordem.map((id) => ({ id, presentes: novo.itens[id] }));
    try {
      onSalvo(await adminApi('/admin/presentes/organizacao', { method: 'PUT', body: { categorias: corpo } }));
      setEstado('salvo');
    } catch (error) {
      setLayout(antes.current);
      setErro(errorMessage(error));
      setEstado('');
    }
  };

  const aoIniciar = ({ active }: DragStartEvent) => {
    antes.current = layoutAtual.current;
    setAtivo(active.id);
  };

  // Moving a gift into another category happens while dragging, so the list
  // opens room for it where it will land.
  const aoPassar = ({ active, over }: DragOverEvent) => {
    if (!over || tipo(active.id) !== 'p') return;
    setLayout((l) => {
      const presenteId = numero(active.id);
      const origem = categoriaDoPresente(l, presenteId);
      const destino = tipo(over.id) === 'l' ? numero(over.id) : categoriaDoPresente(l, numero(over.id));
      if (origem === undefined || destino === undefined || origem === destino) return l;
      const alvo = l.itens[destino];
      const indice = tipo(over.id) === 'p' ? alvo.indexOf(numero(over.id)) : alvo.length;
      return {
        ...l,
        itens: {
          ...l.itens,
          [origem]: l.itens[origem].filter((id) => id !== presenteId),
          [destino]: [...alvo.slice(0, indice), presenteId, ...alvo.slice(indice)],
        },
      };
    });
  };

  const aoSoltar = ({ active, over }: DragEndEvent) => {
    setAtivo(null);
    let novo = layoutAtual.current;
    if (over && tipo(active.id) === 'c' && tipo(over.id) === 'c' && active.id !== over.id) {
      novo = { ...novo, ordem: arrayMove(novo.ordem, novo.ordem.indexOf(numero(active.id)), novo.ordem.indexOf(numero(over.id))) };
    }
    if (over && tipo(active.id) === 'p' && tipo(over.id) === 'p' && active.id !== over.id) {
      const categoria = categoriaDoPresente(novo, numero(active.id));
      if (categoria !== undefined && novo.itens[categoria].includes(numero(over.id))) {
        const lista = novo.itens[categoria];
        novo = {
          ...novo,
          itens: { ...novo.itens, [categoria]: arrayMove(lista, lista.indexOf(numero(active.id)), lista.indexOf(numero(over.id))) },
        };
      }
    }
    setLayout(novo);
    if (JSON.stringify(novo) !== JSON.stringify(antes.current)) salvar(novo);
  };

  const aoCancelar = () => {
    setAtivo(null);
    setLayout(antes.current);
  };

  const presenteAtivo = ativo && tipo(ativo) === 'p' ? porId.get(numero(ativo)) : undefined;
  const categoriaAtiva = ativo && tipo(ativo) === 'c' ? categoriaPorId.get(numero(ativo)) : undefined;

  return (
    <div className="organizar">
      <div className="organizar__barra">
        <p className="organizar__ajuda">
          Arraste os presentes para mudar a ordem ou levá-los para outra categoria, e arraste as categorias pelo título para
          reordená-las (no celular, toque e segure antes de arrastar). Tudo é salvo na hora.
        </p>
        <div className="organizar__acoes">
          <span className="organizar__estado" role="status">
            {estado === 'salvando' ? 'Salvando…' : estado === 'salvo' ? '✓ Salvo' : ''}
          </span>
          <button className="nv-btn-ghost" onClick={() => setRecolhidas((r) => !r)}>
            {recolhidas ? 'Mostrar presentes' : 'Só categorias'}
          </button>
          <button className="nv-btn" onClick={onConcluir}>
            Concluir
          </button>
        </div>
      </div>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={deteccao}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={aoIniciar}
        onDragOver={aoPassar}
        onDragEnd={aoSoltar}
        onDragCancel={aoCancelar}
      >
        <SortableContext items={layout.ordem.map(idCategoria)} strategy={verticalListSortingStrategy}>
          {layout.ordem.map((id) => {
            const categoria = categoriaPorId.get(id);
            if (!categoria) return null;
            return (
              <CategoriaArrastavel key={id} categoria={categoria} quantidade={layout.itens[id].length} recolhida={recolhidas}>
                <SortableContext items={layout.itens[id].map(idPresente)} strategy={verticalListSortingStrategy}>
                  <AreaDaCategoria id={id} vazia={layout.itens[id].length === 0}>
                    {layout.itens[id].map((presenteId) => {
                      const p = porId.get(presenteId);
                      return p ? <PresenteArrastavel key={presenteId} presente={p} /> : null;
                    })}
                  </AreaDaCategoria>
                </SortableContext>
              </CategoriaArrastavel>
            );
          })}
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }}>
          {presenteAtivo && <LinhaPresente presente={presenteAtivo} flutuando />}
          {categoriaAtiva && (
            <div className="organizar-categoria is-flutuando">
              <CabecalhoCategoria categoria={categoriaAtiva} quantidade={layout.itens[categoriaAtiva.id]?.length ?? 0} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function CabecalhoCategoria({ categoria, quantidade }: { categoria: Categoria; quantidade: number }) {
  return (
    <div className="organizar-categoria__topo">
      <span className="organizar__alca" aria-hidden>
        ⠿
      </span>
      <span className="painel-categoria__icone">
        <Icon name={iconeDaCategoria(categoria.icone)} size={18} />
      </span>
      <strong>{categoria.nome}</strong>
      <span className="organizar-categoria__qtd">
        {quantidade} presente{quantidade === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function CategoriaArrastavel({
  categoria,
  quantidade,
  recolhida,
  children,
}: {
  categoria: Categoria;
  quantidade: number;
  recolhida: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: idCategoria(categoria.id),
  });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return (
    <section ref={setNodeRef} style={style} className={isDragging ? 'organizar-categoria is-origem' : 'organizar-categoria'}>
      <div
        ref={setActivatorNodeRef}
        className="organizar-categoria__alca"
        {...attributes}
        {...listeners}
        aria-label={`Arrastar a categoria ${categoria.nome}`}
      >
        <CabecalhoCategoria categoria={categoria} quantidade={quantidade} />
      </div>
      {!recolhida && children}
    </section>
  );
}

// Drop zone of a category's gifts; also catches drops into an empty category.
function AreaDaCategoria({ id, vazia, children }: { id: number; vazia: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: idArea(id) });
  return (
    <ul ref={setNodeRef} className={isOver ? 'organizar-lista is-alvo' : 'organizar-lista'}>
      {children}
      {vazia && <li className="organizar-lista__vazia">Solte um presente aqui</li>}
    </ul>
  );
}

function PresenteArrastavel({ presente }: { presente: Presente }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: idPresente(presente.id) });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'organizar-item is-origem' : 'organizar-item'}
      {...attributes}
      {...listeners}
      aria-label={`Arrastar ${presente.nome}`}
    >
      <LinhaPresente presente={presente} />
    </li>
  );
}

function LinhaPresente({ presente, flutuando }: { presente: Presente; flutuando?: boolean }) {
  return (
    <div className={flutuando ? 'organizar-linha is-flutuando' : 'organizar-linha'}>
      <span className="organizar__alca" aria-hidden>
        ⠿
      </span>
      <span className="organizar-linha__foto">
        {presente.fotoUrl ? <img src={presente.fotoUrl} alt="" /> : <Icon name="camera" size={16} />}
      </span>
      <span className="organizar-linha__nome">{presente.nome}</span>
      <span className="organizar-linha__valor">{formatBRL(presente.valorCentavos)}</span>
    </div>
  );
}
