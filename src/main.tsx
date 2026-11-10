import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App.tsx';
import { applyTheme, watchSystemTheme } from './app/theme.ts';
import { initInstallPrompt } from './app/install.ts';
import './index.css';

initInstallPrompt();
applyTheme();
watchSystemTheme();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
