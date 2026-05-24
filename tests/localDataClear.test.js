import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../src/theme.js';
import { addPlayer, getPlayers, deleteDatabase } from '../src/api/indexeddb.js';
import {
  clearArjenTimerLocalStorage,
  clearLocalAppCache,
} from '../src/api/localDataClear.js';

function createLocalStorageMock() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)),
    clear: () => store.clear(),
  };
}

describe('localDataClear', () => {
  beforeEach(async () => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    await deleteDatabase();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clearLocalAppCache remove jogadores do IndexedDB', async () => {
    await addPlayer('Teste');
    expect((await getPlayers()).length).toBe(1);

    await clearLocalAppCache();

    expect(await getPlayers()).toHaveLength(0);
  });

  it('clearArjenTimerLocalStorage remove chaves de cronômetro e preserva tema', () => {
    localStorage.setItem('arjen-timer-match-round-1', 'match-abc');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    clearArjenTimerLocalStorage();

    expect(localStorage.getItem('arjen-timer-match-round-1')).toBeNull();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('clearLocalAppCache remove chaves de cronômetro', async () => {
    localStorage.setItem('arjen-timer-match-x', 'y');

    await clearLocalAppCache();

    expect(localStorage.getItem('arjen-timer-match-x')).toBeNull();
  });
});
