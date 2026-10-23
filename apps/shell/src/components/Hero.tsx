import { Branch, casamento, locais, Ornament } from '@nv/shared';

export function Hero() {
  return (
    <section id="convite" className="shell-hero">
      <div className="shell-hero__wash" aria-hidden />
      <Branch className="shell-hero__branch shell-hero__branch--tl" />
      <Branch className="shell-hero__branch shell-hero__branch--br" />

      <div className="shell-hero__arch">
        <div className="shell-hero__content">
          <p className="shell-hero__kicker">Com a bênção de Deus e de nossas famílias</p>
          <p className="shell-hero__invite">convidamos você para o nosso casamento</p>
          <h1 className="shell-hero__names">
            <span>{casamento.noiva}</span>
            <span className="shell-hero__amp">&amp;</span>
            <span>{casamento.noivo}</span>
          </h1>
          <Ornament className="shell-hero__ornament" />
          <div className="shell-hero__date">
            <span className="shell-hero__date-side">{casamento.diaSemana}</span>
            <span className="shell-hero__date-main">
              <small>Agosto</small>
              <strong>28</strong>
              <small>2027</small>
            </span>
            <span className="shell-hero__date-side">{locais.cerimonia.horario}</span>
          </div>
          <p className="shell-hero__place">
            {locais.cerimonia.nome} · {casamento.cidade}
          </p>
        </div>
      </div>

      <a href="#evento" className="shell-hero__cta">
        <span>Nosso grande dia</span>
        <span className="shell-hero__cta-line" aria-hidden />
      </a>
    </section>
  );
}
