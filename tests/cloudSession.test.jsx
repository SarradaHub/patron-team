import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { closeDB, deleteDatabase } from '../src/api/indexeddb.js';

const { invokeMock, signInMock, signOutMock, getSessionMock, onAuthStateChangeMock } = vi.hoisted(
  () => ({
    invokeMock: vi.fn(),
    signInMock: vi.fn(),
    signOutMock: vi.fn(),
    getSessionMock: vi.fn(),
    onAuthStateChangeMock: vi.fn(),
  })
);

vi.mock('../src/lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      signInWithPassword: signInMock,
      signOut: signOutMock,
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
    functions: { invoke: invokeMock },
  },
  isSupabaseConfigured: () => true,
}));

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

function setNativeValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buttonByText(root, text) {
  return [...root.querySelectorAll('button')].find((button) => button.textContent.trim() === text);
}

async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await flush(20);
  }
  throw new Error('a tela não chegou no estado esperado');
}

describe('Entrar envia o snapshot que estava esperando', () => {
  let container;
  let root;

  beforeEach(() => {
    installMatchMedia();
    invokeMock.mockReset();
    signInMock.mockReset();
    signOutMock.mockReset();
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: null } });
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe() {} } },
    });
    signOutMock.mockResolvedValue({ error: null });
    sessionStorage.clear();
  });

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

  async function renderApp() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await flush();
  }

  async function addPlayer(name) {
    await waitFor(() => container.querySelector('[data-testid="add-player-submit"]')?.disabled === false);
    const input = container.querySelector('[data-testid="add-player-input"]');
    await act(async () => {
      setNativeValue(input, name);
    });
    await act(async () => {
      container.querySelector('[data-testid="add-player-submit"]').click();
    });
    await waitFor(() => container.querySelector('[data-testid="queue-panel"]')?.textContent.includes(name));
  }

  it('manda o snapshot de antes do login com o export id guardado', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    });
    signInMock.mockResolvedValue({
      data: {
        session: { user: { email: 'org@pelada.test' } },
        user: { email: 'org@pelada.test' },
      },
      error: null,
    });

    await renderApp();
    await addPlayer('Ana');

    await act(async () => {
      container.querySelector('[data-testid="export-data-button"]').click();
    });
    await waitFor(() => container.querySelector('#login-user'));
    expect(invokeMock).not.toHaveBeenCalled();

    await addPlayer('Bruno');

    await act(async () => {
      setNativeValue(container.querySelector('#login-user'), 'org@pelada.test');
      setNativeValue(container.querySelector('#login-pass'), 'segredo');
    });
    await act(async () => {
      buttonByText(container, 'Entrar').click();
    });
    await waitFor(() => invokeMock.mock.calls.length === 1);

    const body = invokeMock.mock.calls[0][1].body;
    expect(body.players.map((player) => player.name)).toEqual(['Ana']);
    const stored = JSON.parse(sessionStorage.getItem('patron-team-pending-export'));
    expect(stored.exportId).toBe(body.exportId);
    expect(container.querySelector('[data-testid="cloud-account-email"]')?.textContent).toBe(
      'org@pelada.test'
    );
    expect(container.querySelector('#login-user')).toBeNull();
    expect(container.querySelector('[data-testid="queue-panel"]')?.textContent).toContain('Bruno');
  });

  it('senha errada permanece no formulário e não envia', async () => {
    signInMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials' },
    });

    await renderApp();
    await act(async () => {
      container.querySelector('[data-testid="export-data-button"]').click();
    });
    await waitFor(() => container.querySelector('#login-user'));

    await act(async () => {
      setNativeValue(container.querySelector('#login-user'), 'org@pelada.test');
      setNativeValue(container.querySelector('#login-pass'), 'errada');
    });
    await act(async () => {
      buttonByText(container, 'Entrar').click();
    });
    await flush();

    expect(container.querySelector('#login-user')).not.toBeNull();
    expect(container.querySelector('#login-pass')?.value).toBe('errada');
    expect(container.querySelector('.login-error')?.textContent).toBe('Invalid login credentials');
    expect(invokeMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="cloud-account-email"]')).toBeNull();
  });

  it('e-mail fora da lista avisa e continua na sessão', async () => {
    signInMock.mockResolvedValue({
      data: {
        session: { user: { email: 'fora@pelada.test' } },
        user: { email: 'fora@pelada.test' },
      },
      error: null,
    });
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            ok: false,
            error: 'Este e-mail não está autorizado a enviar para a nuvem.',
          }),
        },
      },
    });

    await renderApp();
    await act(async () => {
      container.querySelector('[data-testid="export-data-button"]').click();
    });
    await waitFor(() => container.querySelector('#login-user'));
    await act(async () => {
      setNativeValue(container.querySelector('#login-user'), 'fora@pelada.test');
      setNativeValue(container.querySelector('#login-pass'), 'segredo');
    });
    await act(async () => {
      buttonByText(container, 'Entrar').click();
    });
    await waitFor(() => document.body.textContent.includes('Este e-mail não está autorizado a enviar para a nuvem.'));

    expect(container.querySelector('[data-testid="cloud-account-email"]')?.textContent).toBe(
      'fora@pelada.test'
    );
    expect(buttonByText(container, 'Sair')).toBeTruthy();
    expect(container.querySelector('#login-user')).toBeNull();
  });

  it('Sair esquece a sessão e deixa o jogador na fila', async () => {
    signInMock.mockResolvedValue({
      data: {
        session: { user: { email: 'org@pelada.test' } },
        user: { email: 'org@pelada.test' },
      },
      error: null,
    });
    invokeMock.mockResolvedValue({
      data: { ok: true, batchId: 'batch-1' },
      error: null,
    });

    await renderApp();
    await addPlayer('Ana');
    await act(async () => {
      container.querySelector('[data-testid="export-data-button"]').click();
    });
    await waitFor(() => container.querySelector('#login-user'));
    await act(async () => {
      setNativeValue(container.querySelector('#login-user'), 'org@pelada.test');
      setNativeValue(container.querySelector('#login-pass'), 'segredo');
    });
    await act(async () => {
      buttonByText(container, 'Entrar').click();
    });
    await waitFor(() => buttonByText(container, 'Sair'));

    await act(async () => {
      buttonByText(container, 'Sair').click();
    });
    await flush();

    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(container.querySelector('[data-testid="cloud-account-email"]')).toBeNull();
    expect(buttonByText(container, 'Sair')).toBeUndefined();
    expect(container.querySelector('[data-testid="queue-panel"]')?.textContent).toContain('Ana');
    expect(container.querySelector('#login-user')).toBeNull();
  });

  it('sessão já aberta mostra o e-mail e envia sem Entrar', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { email: 'org@pelada.test' } } },
    });
    invokeMock.mockResolvedValue({
      data: { ok: true, batchId: 'batch-1' },
      error: null,
    });

    await renderApp();
    await waitFor(
      () => container.querySelector('[data-testid="cloud-account-email"]')?.textContent === 'org@pelada.test'
    );

    await act(async () => {
      container.querySelector('[data-testid="export-data-button"]').click();
    });
    await waitFor(() => invokeMock.mock.calls.length === 1);

    expect(container.querySelector('#login-user')).toBeNull();
    expect(invokeMock.mock.calls[0][1].body.exportId).toEqual(expect.any(String));
  });
});
