// Standalone page used only when running this remote on its own (npm run dev -w @nv/rsvp).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nv/shared/theme.css';
import Rsvp from './Rsvp';
import Portaria from './Portaria';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Rsvp />
    <Portaria />
  </StrictMode>,
);
