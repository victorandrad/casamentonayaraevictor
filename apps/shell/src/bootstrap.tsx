import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nv/shared/theme.css';
import './shell.css';
import { App } from './App';
import { easterEgg } from './easterEgg';

easterEgg();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
