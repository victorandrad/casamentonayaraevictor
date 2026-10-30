import type { AvisosCsp } from '@nv/shared/types';
import { adminApi } from './adminApi';
import { useLoad } from './useLoad';

const carregar = () => adminApi<AvisosCsp>('/admin/seguranca/csp');

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// What the site's security policy (CSP) would block, reported by visitors' browsers. While the policy
// only reports, this list shows whether anything legitimate (the payment form, the map) would break
// before it is switched to block for real.
export function SegurancaSite() {
  const { data, erro, reload } = useLoad(carregar);
  return (
    <div className="painel-card painel-narrow">
      <h3 className="painel-h3">Segurança do site</h3>
      <p className="painel-hint">
        O site diz ao navegador de onde scripts, frames e conexões podem vir (só do próprio site, do Mercado Pago e do
        Google). Por enquanto a regra só avisa, sem bloquear: abaixo aparece o que ela bloquearia. Com o tempo, se só
        aparecerem coisas estranhas (extensões do navegador, sites desconhecidos), ela pode passar a bloquear de verdade.
      </p>
      {erro && (
        <p className="painel-alert" role="alert">
          {erro}
        </p>
      )}
      {data && data.avisos.length === 0 && <p className="painel-hint">Nenhum aviso desde {dataHora(data.desde)}.</p>}
      {data && data.avisos.length > 0 && (
        <ul className="painel-csp">
          {data.avisos.map((a) => (
            <li key={`${a.diretiva} ${a.bloqueado}`}>
              <code>{a.diretiva}</code> · <strong>{a.bloqueado}</strong>
              <span>
                {a.quantidade}× · último em {dataHora(a.ultimo)}
                {a.pagina && ` · ${a.pagina}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <p className="painel-mp__aplicacao">
          Avisos desde {dataHora(data.desde)} (a lista recomeça a cada atualização do site) ·{' '}
          <button className="painel-link" onClick={reload}>
            Atualizar
          </button>
        </p>
      )}
    </div>
  );
}
