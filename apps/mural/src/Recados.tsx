import { useEffect, useState, type FormEvent } from 'react';
import { EstadoVazio, SectionHeader } from '@nv/shared';
import { api, errorMessage } from '@nv/shared/api';
import type { Recado, RecadoInput } from '@nv/shared/types';
import './mural.css';

export default function Recados() {
  const [recados, setRecados] = useState<Recado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api<Recado[]>('/public/recados', { signal: controller.signal })
      .then(setRecados)
      .catch((error) => error.name !== 'AbortError' && setErro(errorMessage(error)))
      .finally(() => setCarregando(false));
    return () => controller.abort();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !mensagem.trim()) {
      setErro('Preencha seu nome e o recado.');
      return;
    }
    setEnviando(true);
    setErro('');
    try {
      const body: RecadoInput = { nome: nome.trim(), mensagem: mensagem.trim() };
      const novo = await api<Recado>('/public/recados', { method: 'POST', body });
      setRecados((list) => [novo, ...list]);
      setNome('');
      setMensagem('');
    } catch (error) {
      setErro(errorMessage(error));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section id="recados" className="nv-section nv-section--alt">
      <div className="nv-container--narrow">
        <SectionHeader eyebrow="Mural de carinho" title="Recados dos convidados" />
        <form className="recados-form" onSubmit={submit}>
          <input
            className="nv-input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Seu nome"
            maxLength={80}
          />
          <textarea
            className="nv-input"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Escreva um recado para os noivos"
            maxLength={600}
            rows={3}
          />
          {erro && (
            <p className="recados-error" role="alert">
              {erro}
            </p>
          )}
          <button type="submit" className="nv-btn" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Deixar recado'}
          </button>
        </form>
        <div className="recados-list">
          {carregando && <p className="recados-empty">Carregando recados…</p>}
          {!carregando && recados.length === 0 && !erro && (
            <EstadoVazio icon="envelope" titulo="O mural ainda está em branco">
              Seja o primeiro a deixar um recado de carinho para os noivos.
            </EstadoVazio>
          )}
          {recados.map((r) => (
            <div key={r.id} className="recados-item nv-reveal">
              <p className="recados-item__msg">{r.mensagem}</p>
              <p className="recados-item__author">— {r.nome}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
