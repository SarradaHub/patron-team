/**
 * Cronômetro da partida agendada: duração, início e zerar.
 * Um put atrasado não desfaz resultado nem recria partida apagada.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  deleteDatabase,
  ensureDefaultActiveRound,
  getActiveRoundId,
  addPlayer,
  formTeam,
  scheduleMatch,
  getMatchById,
  finalizeMatch,
  setScheduledMatchTimerDuration,
  startScheduledMatchCountdown,
  clearScheduledMatchCountdown,
  deleteMatch,
} from '../src/api/indexeddb.js';

function tick() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function waitUntil(predicate) {
  for (let i = 0; i < 40; i += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error('A escrita do cronômetro não chegou a ser pedida.');
}

function createReq() {
  return { result: undefined, error: null, onsuccess: null, onerror: null };
}

function bindRequest(realReq, req) {
  realReq.onsuccess = () => {
    req.result = realReq.result;
    if (req.onsuccess) req.onsuccess();
  };
  realReq.onerror = () => {
    req.error = realReq.error;
    if (req.onerror) req.onerror();
  };
}

/**
 * Segura a próxima transação só de `matches` até o teste gravar o resultado
 * ou apagar a partida. O put do cronômetro corre depois.
 */
function holdNextMatchesOnlyWrite() {
  const orig = IDBDatabase.prototype.transaction;
  let releaseGate;
  const gate = new Promise((resolve) => {
    releaseGate = resolve;
  });
  let held = false;

  function defer(openReal) {
    let realTx = null;
    let realStore = null;
    const handlers = {};
    const queued = [];

    const tx = {
      set oncomplete(fn) {
        handlers.oncomplete = fn;
        if (realTx) realTx.oncomplete = fn;
      },
      get oncomplete() {
        return handlers.oncomplete;
      },
      set onerror(fn) {
        handlers.onerror = fn;
        if (realTx) realTx.onerror = fn;
      },
      get onerror() {
        return handlers.onerror;
      },
      set onabort(fn) {
        handlers.onabort = fn;
        if (realTx) realTx.onabort = fn;
      },
      get onabort() {
        return handlers.onabort;
      },
      get error() {
        return realTx ? realTx.error : null;
      },
      abort() {
        if (realTx) realTx.abort();
      },
      objectStore() {
        return {
          get(key) {
            const req = createReq();
            const exec = () => bindRequest(realStore.get(key), req);
            if (realStore) exec();
            else queued.push(exec);
            return req;
          },
          put(value, key) {
            const req = createReq();
            const exec = () => bindRequest(realStore.put(value, key), req);
            if (realStore) exec();
            else queued.push(exec);
            return req;
          },
        };
      },
    };

    gate.then(() => {
      realTx = openReal();
      if (handlers.oncomplete) realTx.oncomplete = handlers.oncomplete;
      if (handlers.onerror) realTx.onerror = handlers.onerror;
      if (handlers.onabort) realTx.onabort = handlers.onabort;
      realStore = realTx.objectStore('matches');
      for (const exec of queued) exec();
    });

    return tx;
  }

  IDBDatabase.prototype.transaction = function transaction(storeNames, mode) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const matchesOnly = mode === 'readwrite' && names.length === 1 && names[0] === 'matches';
    if (matchesOnly && !held) {
      held = true;
      IDBDatabase.prototype.transaction = orig;
      return defer(() => orig.call(this, storeNames, mode));
    }
    return orig.call(this, storeNames, mode);
  };

  return {
    whenHeld: () => waitUntil(() => held),
    release: () => releaseGate(),
    restore() {
      IDBDatabase.prototype.transaction = orig;
    },
  };
}

async function scheduledMatch() {
  await ensureDefaultActiveRound();
  const roundId = await getActiveRoundId();
  for (let i = 1; i <= 10; i += 1) {
    await addPlayer(`Jogador ${i}`);
    await new Promise((r) => setTimeout(r, 2));
  }
  const teamA = await formTeam(5, roundId);
  const teamB = await formTeam(5, roundId);
  const match = await scheduleMatch(roundId, teamA.id, teamB.id, { teamSize: 5 });
  return { roundId, teamA, teamB, match };
}

beforeEach(async () => {
  await deleteDatabase();
});

describe('cronômetro da partida agendada', () => {
  it('define a duração enquanto a partida está agendada', async () => {
    const { match } = await scheduledMatch();
    await setScheduledMatchTimerDuration(match.id, 15);

    const saved = await getMatchById(match.id);
    expect(saved.timerDurationMinutes).toBe(15);
    expect(saved.countdownEndsAt).toBeNull();
    expect(saved.status).toBe('scheduled');
    expect(saved.result).toBeNull();
    expect(saved.teamA).toBe(match.teamA);
    expect(saved.teamB).toBe(match.teamB);
  });

  it('inicia a contagem enquanto a partida está agendada', async () => {
    const { match } = await scheduledMatch();
    const before = Date.now();
    await startScheduledMatchCountdown(match.id);
    const after = Date.now();

    const saved = await getMatchById(match.id);
    const endsAt = new Date(saved.countdownEndsAt).getTime();
    expect(saved.status).toBe('scheduled');
    expect(saved.timerDurationMinutes).toBe(10);
    expect(endsAt).toBeGreaterThanOrEqual(before + 10 * 60 * 1000);
    expect(endsAt).toBeLessThanOrEqual(after + 10 * 60 * 1000);
  });

  it('apagar a partida antes do put de início não recria a partida', async () => {
    const { match } = await scheduledMatch();
    const hold = holdNextMatchesOnlyWrite();
    try {
      const timerWrite = startScheduledMatchCountdown(match.id);
      await hold.whenHeld();
      await deleteMatch(match.id);
      hold.release();
      await timerWrite.catch(() => {});

      expect(await getMatchById(match.id)).toBeUndefined();
    } finally {
      hold.restore();
    }
  });

  it('zera a contagem e mantém a duração', async () => {
    const { match } = await scheduledMatch();
    await startScheduledMatchCountdown(match.id);
    await clearScheduledMatchCountdown(match.id);

    const saved = await getMatchById(match.id);
    expect(saved.countdownEndsAt).toBeNull();
    expect(saved.timerDurationMinutes).toBe(10);
    expect(saved.status).toBe('scheduled');
    expect(saved.result).toBeNull();
  });

  it('apagar a partida antes do put de zerar não recria a partida', async () => {
    const { match } = await scheduledMatch();
    await startScheduledMatchCountdown(match.id);
    const hold = holdNextMatchesOnlyWrite();
    try {
      const timerWrite = clearScheduledMatchCountdown(match.id);
      await hold.whenHeld();
      await deleteMatch(match.id);
      hold.release();
      await timerWrite.catch(() => {});

      expect(await getMatchById(match.id)).toBeUndefined();
    } finally {
      hold.restore();
    }
  });

  it('um resultado gravado antes do put da duração permanece gravado', async () => {
    const { match } = await scheduledMatch();
    const hold = holdNextMatchesOnlyWrite();
    try {
      const timerWrite = setScheduledMatchTimerDuration(match.id, 15);
      await hold.whenHeld();
      await finalizeMatch(match.id, 'A_win', { teamSize: 5 });
      hold.release();
      await timerWrite.catch(() => {});

      const saved = await getMatchById(match.id);
      expect(saved.status).toBe('finalized');
      expect(saved.result).toBe('A_win');
      expect(saved.timerDurationMinutes).toBe(10);
    } finally {
      hold.restore();
    }
  });
});
