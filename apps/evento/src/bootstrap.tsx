// Standalone page used only when running this remote on its own (npm run dev -w @nv/evento).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nv/shared/theme.css';
import Evento from './Evento';
import Traje from './Traje';
import Local from './Local';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Evento />
    <Traje />
    <Local />
  </StrictMode>,
);
