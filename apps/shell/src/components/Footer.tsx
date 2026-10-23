import { Branch, casamento } from '@nv/shared';

export function Footer() {
  return (
    <footer className="shell-footer">
      <div className="shell-footer__monogram">
        <Branch className="shell-footer__wreath shell-footer__wreath--l" />
        <Branch className="shell-footer__wreath shell-footer__wreath--r" />
        <span>
          N<em>&amp;</em>V
        </span>
      </div>
      <p className="shell-footer__names">
        {casamento.noiva} &amp; {casamento.noivo}
      </p>
      <p className="shell-footer__date">
        {casamento.dataExtenso} · {casamento.cidade}
      </p>
      <p className="shell-footer__note">Feito com amor para celebrar o nosso dia.</p>
    </footer>
  );
}
