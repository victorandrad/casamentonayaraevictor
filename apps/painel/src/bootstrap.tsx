// Standalone page used only when running this remote on its own (npm run dev -w @nv/painel).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nv/shared/theme.css';
import Painel from './Painel';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Painel />
  </StrictMode>,
);
