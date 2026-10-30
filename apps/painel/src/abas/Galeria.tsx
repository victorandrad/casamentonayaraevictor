import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EstadoVazio, Icon } from '@nv/shared';
import { errorMessage } from '@nv/shared/api';
import { MOMENTOS, rotuloMomento, type Momento } from '@nv/shared/galeria';
import type { FotoGaleria } from '@nv/shared/types';
import { adminApi, enviarFoto } from '../adminApi';
import { useLoad } from '../useLoad';
import { ConfirmarModal, Modal } from '../Modal';
import { FotoUpload } from '../FotoUpload';

const carregar = () => adminApi<FotoGaleria[]>('/admin/galeria');
const LIMITE_MB = 10;
const TIPOS = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

function SelectMomento({ id, value, onChange }: { id: string; value: string; onChange: (m: Momento) => void }) {
  return (
    <select id={id} className="nv-input painel-select" value={value} onChange={(e) => onChange(e.target.value as Momento)}>
      {MOMENTOS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

type Envio = { nome: string; estado: 'fila' | 'enviando' | 'ok' | 'erro'; erro?: string };

// Several photos at once: each one is uploaded and added to the end of the gallery.
function EnviarFotosModal({ onEnviada, onFechar }: { onEnviada: (f: FotoGaleria) => void; onFechar: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [momento, setMomento] = useState<Momento>('nos');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [enviando, setEnviando] = useState(false);
  const terminou = envios.length > 0 && !enviando;

  const escolher = (lista: FileList | null) => {
    if (!lista) return;
    setArquivos((atuais) => [...atuais, ...Array.from(lista).filter((f) => f.type.startsWith('image/'))]);
    setEnvios([]);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!arquivos.length) return;
    setEnviando(true);
    const estados: Envio[] = arquivos.map((a) => ({ nome: a.name, estado: 'fila' }));
    setEnvios([...estados]);
    for (let i = 0; i < arquivos.length; i++) {
      estados[i] = { ...estados[i], estado: 'enviando' };
      setEnvios([...estados]);
      try {
        if (arquivos[i].size > LIMITE_MB * 1024 * 1024) throw new Error(`Passa de ${LIMITE_MB} MB.`);
        const url = await enviarFoto(arquivos[i], 'galeria');
        onEnviada(await adminApi<FotoGaleria>('/admin/galeria', { method: 'POST', body: { url, legenda: '', momento } }));
        estados[i] = { ...estados[i], estado: 'ok' };
      } catch (error) {
        estados[i] = { ...estados[i], estado: 'erro', erro: errorMessage(error) };
      }
      setEnvios([...estados]);
    }
    setArquivos(arquivos.filter((_, i) => estados[i].estado === 'erro'));
    setEnviando(false);
  };

  const ok = envios.filter((e) => e.estado === 'ok').length;

  return (
    <Modal
      titulo="Enviar fotos"
      subtitulo="Escolha várias de uma vez. Depois dá para pôr legenda e mudar a ordem."
      largura="larga"
      onFechar={onFechar}
      onSubmit={enviar}
      bloqueado={enviando}
      rodape={
        <>
          <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={enviando}>
            {terminou ? 'Fechar' : 'Cancelar'}
          </button>
          <button type="submit" className="nv-btn" disabled={enviando || !arquivos.length}>
            {enviando ? 'Enviando…' : arquivos.length ? `Enviar ${arquivos.length} foto${arquivos.length > 1 ? 's' : ''}` : 'Enviar'}
          </button>
        </>
      }
    >
      <label className="nv-label" htmlFor="galeria-momento">
        Momento
      </label>
      <SelectMomento id="galeria-momento" value={momento} onChange={setMomento} />

      <button
        type="button"
        className="galeria-drop"
        onClick={() => input.current?.click()}
        disabled={enviando}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          escolher(e.dataTransfer.files);
        }}
      >
        <Icon name="camera" size={30} />
        <strong>Clique para escolher as fotos</strong>
        <span>ou arraste aqui · JPG, PNG, WebP ou HEIC · até {LIMITE_MB} MB cada</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={TIPOS}
        multiple
        hidden
        onChange={(e) => {
          escolher(e.target.files);
          e.target.value = '';
        }}
      />

      {envios.length > 0 ? (
        <ul className="galeria-envios">
          {envios.map((e, i) => (
            <li key={i} className={`galeria-envios__item is-${e.estado}`}>
              <span className="galeria-envios__nome">{e.nome}</span>
              <span>{e.estado === 'fila' ? 'Na fila' : e.estado === 'enviando' ? 'Enviando…' : e.estado === 'ok' ? '✓ Enviada' : e.erro}</span>
            </li>
          ))}
        </ul>
      ) : (
        arquivos.length > 0 && (
          <p className="painel-hint">
            {arquivos.length} foto{arquivos.length > 1 ? 's' : ''} escolhida{arquivos.length > 1 ? 's' : ''}.{' '}
            <button type="button" className="painel-link" onClick={() => setArquivos([])}>
              Limpar
            </button>
          </p>
        )
      )}
      {terminou && (
        <p className="painel-hint" role="status">
          {ok} de {envios.length} enviada{envios.length > 1 ? 's' : ''}.{' '}
          {arquivos.length > 0 && 'As que deram erro continuam escolhidas para tentar de novo.'}
        </p>
      )}
    </Modal>
  );
}

function EditarFotoModal({ foto, onSalva, onFechar }: { foto: FotoGaleria; onSalva: (f: FotoGaleria) => void; onFechar: () => void }) {
  const [url, setUrl] = useState(foto.url);
  const [legenda, setLegenda] = useState(foto.legenda);
  const [momento, setMomento] = useState<string>(foto.momento);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!url) return setErro('Escolha uma foto.');
    setSalvando(true);
    setErro('');
    try {
      onSalva(await adminApi<FotoGaleria>(`/admin/galeria/${foto.id}`, { method: 'PUT', body: { url, legenda, momento } }));
      onFechar();
    } catch (error) {
      setErro(errorMessage(error));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Editar foto"
      onFechar={onFechar}
      onSubmit={salvar}
      bloqueado={salvando}
      rodape={
        <>
          <button type="button" className="nv-btn-ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="nv-btn" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </>
      }
    >
      <img className="galeria-editar__previa" src={url} alt="" />
      <FotoUpload value={url} onChange={setUrl} tipo="galeria" removivel={false} />
      <label className="nv-label" htmlFor="foto-legenda">
        Legenda (opcional)
      </label>
      <input
        id="foto-legenda"
        className="nv-input"
        placeholder="Ex.: Nossa primeira viagem juntos"
        value={legenda}
        maxLength={140}
        onChange={(e) => setLegenda(e.target.value)}
      />
      <label className="nv-label" htmlFor="foto-momento">
        Momento
      </label>
      <SelectMomento id="foto-momento" value={momento} onChange={setMomento} />
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}

function CartaoFoto({ foto, onEditar, onExcluir }: { foto: FotoGaleria; onEditar: () => void; onExcluir: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: foto.id });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'galeria-cartao is-arrastando' : 'galeria-cartao'}>
      <div className="galeria-cartao__foto" {...attributes} {...listeners} aria-label={`Arrastar ${foto.legenda || 'foto'} para mudar a ordem`}>
        <img src={foto.url} alt="" loading="lazy" draggable={false} />
        <span className="galeria-cartao__alca" aria-hidden>
          ⠿
        </span>
      </div>
      <div className="galeria-cartao__corpo">
        <span className="galeria-cartao__momento">{rotuloMomento(foto.momento)}</span>
        <p className={foto.legenda ? 'galeria-cartao__legenda' : 'galeria-cartao__legenda is-vazia'}>{foto.legenda || 'Sem legenda'}</p>
        <div className="galeria-cartao__acoes">
          <button className="painel-link" onClick={onEditar}>
            Editar
          </button>
          {/* JPG with a readable name, converted by the API from the stored photo. */}
          <a className="painel-link" href={`/api/admin/galeria/${foto.id}/download`} download>
            Baixar
          </a>
          <button className="painel-link painel-link--danger" onClick={onExcluir}>
            Excluir
          </button>
        </div>
      </div>
    </li>
  );
}

export function Galeria() {
  const { data: fotos, setData, erro, setErro } = useLoad(carregar);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [editando, setEditando] = useState<FotoGaleria | null>(null);
  const [excluindo, setExcluindo] = useState<FotoGaleria | null>(null);
  const [salvo, setSalvo] = useState('');

  // Mouse drags right away; on touch screens press and hold so swiping still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reordenar = async ({ active, over }: DragEndEvent) => {
    if (!fotos || !over || active.id === over.id) return;
    const antes = fotos;
    const nova = arrayMove(fotos, fotos.findIndex((f) => f.id === active.id), fotos.findIndex((f) => f.id === over.id));
    setData(nova);
    setSalvo('Salvando…');
    try {
      setData(await adminApi<FotoGaleria[]>('/admin/galeria/ordem', { method: 'PUT', body: { ids: nova.map((f) => f.id) } }));
      setSalvo('✓ Ordem salva');
      setTimeout(() => setSalvo(''), 2000);
    } catch (error) {
      setData(antes);
      setSalvo('');
      setErro(errorMessage(error));
    }
  };

  return (
    <section>
      <div className="painel-section-head">
        <h2 className="painel-h2">Galeria</h2>
        <div className="painel-head-acoes">
          {salvo && (
            <span className="organizar__estado" role="status">
              {salvo}
            </span>
          )}
          {fotos && fotos.length > 0 && (
            <a className="nv-btn-ghost" href="/api/admin/galeria/fotos.zip" download>
              Baixar todas (.zip)
            </a>
          )}
          <button className="nv-btn" onClick={() => setEnviandoFotos(true)}>
            + Enviar fotos
          </button>
        </div>
      </div>
      <p className="painel-hint">
        As fotos aparecem na seção “Nossa história em fotos” do site, nesta ordem. Arraste para reordenar (no celular, toque e segure).
      </p>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      {!fotos && !erro && <p className="painel-empty">Carregando…</p>}
      {fotos?.length === 0 && (
        <EstadoVazio
          icon="camera"
          titulo="Nenhuma foto na galeria"
          acao={
            <button className="nv-btn" onClick={() => setEnviandoFotos(true)}>
              Enviar as primeiras fotos
            </button>
          }
        >
          Enquanto não houver fotos, o site mostra “Em breve, nossas fotos”.
        </EstadoVazio>
      )}

      {fotos && fotos.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reordenar}>
          <SortableContext items={fotos.map((f) => f.id)} strategy={rectSortingStrategy}>
            <ul className="galeria-grade">
              {fotos.map((f) => (
                <CartaoFoto key={f.id} foto={f} onEditar={() => setEditando(f)} onExcluir={() => setExcluindo(f)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {enviandoFotos && (
        <EnviarFotosModal onEnviada={(f) => setData((lista) => [...(lista ?? []), f])} onFechar={() => setEnviandoFotos(false)} />
      )}
      {editando && (
        <EditarFotoModal
          foto={editando}
          onSalva={(salva) => setData((lista) => (lista ?? []).map((f) => (f.id === salva.id ? salva : f)))}
          onFechar={() => setEditando(null)}
        />
      )}
      {excluindo && (
        <ConfirmarModal
          titulo="Excluir foto"
          mensagem={
            <>
              <img className="galeria-editar__previa galeria-editar__previa--pequena" src={excluindo.url} alt="" />
              Excluir esta foto da galeria{excluindo.legenda ? ` (“${excluindo.legenda}”)` : ''}? Ela sai do site na hora.
            </>
          }
          confirmar="Excluir foto"
          onConfirmar={async () => {
            await adminApi(`/admin/galeria/${excluindo.id}`, { method: 'DELETE' });
            setData((lista) => (lista ?? []).filter((f) => f.id !== excluindo.id));
          }}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </section>
  );
}
