import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import App from '../src/App.jsx';
import { closeDB, deleteDatabase } from '../src/api/indexeddb.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function installMatchMedia() {
  if (typeof window.matchMedia === 'function') return;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

function buttonByText(root, text) {
  return [...root.querySelectorAll('button')].find((button) => button.textContent.trim() === text);
}

describe('Enviar para nuvem sem sessão', () => {
  let container;
  let root;

  afterEach(async () => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    closeDB();
    try {
      await deleteDatabase();
    } catch {
      // Another connection can block the delete in jsdom.
    }
    sessionStorage.clear();
  });

  it('abre Entrar e deixa a fila na tela', async () => {
    installMatchMedia();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    const exportButton = container.querySelector('[data-testid="export-data-button"]');
    await act(async () => {
      exportButton.click();
    });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (container.querySelector('#login-user')) break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }

    expect(container.querySelector('#login-user')).not.toBeNull();
    expect(container.querySelector('#login-pass')).not.toBeNull();
    expect(buttonByText(container, 'Entrar')).toBeTruthy();
    const signUp = [...container.querySelectorAll('button, a')].find((el) =>
      /cadastr|criar conta|registrar|sign up/i.test(el.textContent)
    );
    expect(signUp).toBeUndefined();
    expect(container.querySelector('[data-testid="tab-queue"]')).not.toBeNull();
  });
});
