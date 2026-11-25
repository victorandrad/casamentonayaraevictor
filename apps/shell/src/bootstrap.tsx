import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nv/shared/theme.css';
import './shell.css';
import { App } from './App';
import { easterEgg } from './easterEgg';
import { monitorarErros, reportarErro } from './erros';

monitorarErros();
easterEgg();

createRoot(document.getElementById('root')!, {
  // A crash outside the micro-frontend boundaries (RemoteSlot reports the ones inside, with the section).
  onUncaughtError: (erro) => reportarErro(erro, { secao: 'shell' }),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
