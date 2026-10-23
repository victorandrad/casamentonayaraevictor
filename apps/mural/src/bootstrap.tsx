// Standalone page used only when running this remote on its own (npm run dev -w @nv/mural).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nv/shared/theme.css';
import Galeria from './Galeria';
import Recados from './Recados';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Galeria />
    <Recados />
  </StrictMode>,
);
