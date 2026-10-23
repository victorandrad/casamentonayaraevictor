import { Ornament } from '@nv/shared';

export function Verse() {
  return (
    <section className="shell-verse nv-reveal">
      <span className="shell-verse__mark" aria-hidden>
        “
      </span>
      <blockquote className="shell-verse__text">
        O amor é paciente, o amor é bondoso. Tudo desculpa, tudo crê, tudo espera, tudo suporta.
      </blockquote>
      <p className="shell-verse__ref">1 Coríntios 13, 4–7</p>
      <Ornament className="shell-verse__ornament" />
    </section>
  );
}
