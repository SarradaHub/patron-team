import { deleteDatabase, ensureDefaultActiveRound } from './indexeddb.js';

const TIMER_KEY_PREFIX = 'arjen-timer-match-';

export function clearArjenTimerLocalStorage() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(TIMER_KEY_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

export async function clearLocalAppCache() {
  await deleteDatabase();
  clearArjenTimerLocalStorage();
  await ensureDefaultActiveRound();
}
