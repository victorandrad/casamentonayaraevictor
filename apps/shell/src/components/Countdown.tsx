import { useEffect, useState } from 'react';
import { casamento } from '@nv/shared';

const target = new Date(casamento.dataISO).getTime();
const pad = (n: number) => String(n).padStart(2, '0');

function remaining(now: number) {
  const s = Math.floor(Math.max(0, target - now) / 1000);
  return [
    { value: String(Math.floor(s / 86400)), label: 'Dias' },
    { value: pad(Math.floor((s % 86400) / 3600)), label: 'Horas' },
    { value: pad(Math.floor((s % 3600) / 60)), label: 'Minutos' },
    { value: pad(s % 60), label: 'Segundos' },
  ];
}

export function Countdown() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="shell-countdown" aria-label="Contagem regressiva">
      <p className="shell-countdown__title">Contando os dias para o sim</p>
      <div className="shell-countdown__units" role="timer">
        {remaining(now).map((u, i) => (
          <div key={u.label} className="shell-countdown__group">
            {i > 0 && <span className="shell-countdown__sep" aria-hidden />}
            <div className="shell-countdown__unit">
              <div className="shell-countdown__value">{u.value}</div>
              <div className="shell-countdown__label">{u.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
