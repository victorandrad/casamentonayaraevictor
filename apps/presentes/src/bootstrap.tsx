// Standalone page used only when running this remote on its own (npm run dev -w @nv/presentes).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nv/shared/theme.css';
import Presentes from './Presentes';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Presentes />
  </StrictMode>,
);
