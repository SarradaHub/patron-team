import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import App from '../src/App.jsx';

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

describe('abertura', () => {
  let container;
  let root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    sessionStorage.clear();
  });

  it('abre direto na fila, sem senha e sem Sair', async () => {
    installMatchMedia();
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    const sair = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Sair'
    );
    expect(sair).toBeUndefined();
    expect(container.querySelector('#login-user')).toBeNull();
    expect(container.querySelector('[data-testid="tab-queue"]')).not.toBeNull();
  });
});
