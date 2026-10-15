import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { applyTheme, getInitialTheme, syncThemeColorMeta } from './theme.js';

applyTheme(getInitialTheme());
syncThemeColorMeta();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const baseTag = document.querySelector('base');
    const base = baseTag?.href || window.location.href;
    const swUrl = new URL('sw.js', base).href;
    navigator.serviceWorker.register(swUrl, { type: 'module' }).catch((err) => {
      console.error('Erro ao registrar SW:', err);
    });
  });
}

/**
 * Ponto de entrada da aplicação.
 * Renderiza o componente App no elemento #root.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

