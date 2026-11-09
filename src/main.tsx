import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="p-4">
      <h1 className="text-2xl font-bold">Loft Book</h1>
    </main>
  </StrictMode>,
);
