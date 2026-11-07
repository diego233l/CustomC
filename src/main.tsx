import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './state/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Acceso de depuración desde la consola: ?debug en la URL.
if (new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).__configurador = useStore;
}
