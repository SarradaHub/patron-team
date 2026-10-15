import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import FDBDatabase from 'fake-indexeddb/lib/FDBDatabase';
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
import App from '../src/App.jsx';
import {
  openDB,
  deleteDatabase,
  ensureDefaultActiveRound,
  getActiveRoundId,
  loadNightSnapshot,
} from '../src/api/indexeddb.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NIGHT_STORES = ['players', 'teams', 'matches', 'rounds', 'meta', 'player_stats'];

beforeEach(async () => {
  await deleteDatabase();
});

async function seedFinishedNight() {
  await ensureDefaultActiveRound();
  const roundId = await getActiveRoundId();
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['players', 'teams', 'matches', 'player_stats'], 'readwrite');
    tx.objectStore('players').put({
      id: 'ana',
      name: 'Ana',
      status: 'in_field',
      joinedAt: '2020-01-01T00:00:00.000Z',
      goals: 0,
      assists: 0,
    });
    tx.objectStore('players').put({
      id: 'bruno',
      name: 'Bruno',
      status: 'in_field',
      joinedAt: '2020-01-01T00:00:01.000Z',
      goals: 0,
      assists: 0,
    });
    tx.objectStore('players').put({
      id: 'carla',
      name: 'Carla',
      status: 'available',
      joinedAt: '2020-01-01T00:00:02.000Z',
      goals: 0,
      assists: 0,
    });
    tx.objectStore('teams').put({
      id: 'team-a',
      roundId,
      players: ['ana'],
      status: 'in_field',
      isBlocked: false,
    });
    tx.objectStore('teams').put({
      id: 'team-b',
      roundId,
      players: ['bruno'],
      status: 'in_field',
      isBlocked: false,
    });
    tx.objectStore('matches').put({
      id: 'match-1',
      roundId,
      teamA: 'team-a',
      teamB: 'team-b',
      result: 'A_win',
      status: 'finalized',
      draw: false,
      winningTeamId: 'team-a',
      timestamp: '2020-01-02T00:00:00.000Z',
    });
    tx.objectStore('player_stats').put({
      id: 'stat-ana',
      roundId,
      matchId: 'match-1',
      teamId: 'team-a',
      playerId: 'ana',
      goals: 2,
      assists: 1,
      ownGoals: 0,
      wasGoalkeeper: false,
    });
    tx.objectStore('player_stats').put({
      id: 'stat-bruno',
      roundId,
      matchId: 'match-1',
      teamId: 'team-b',
      playerId: 'bruno',
      goals: 0,
      assists: 0,
      ownGoals: 1,
      wasGoalkeeper: false,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return roundId;
}

function watchNightReads(run) {
  const reads = [];
  let statsScans = 0;
  const origTx = FDBDatabase.prototype.transaction;
  const origGetAll = FDBObjectStore.prototype.getAll;
  FDBDatabase.prototype.transaction = function (storeNames, mode = 'readonly') {
    const names = typeof storeNames === 'string' ? [storeNames] : [...storeNames];
    reads.push({ names, mode });
    return origTx.call(this, storeNames, mode);
  };
  FDBObjectStore.prototype.getAll = function (...args) {
    if (this.name === 'player_stats') statsScans += 1;
    return origGetAll.apply(this, args);
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      FDBDatabase.prototype.transaction = origTx;
      FDBObjectStore.prototype.getAll = origGetAll;
    })
    .then((result) => ({ result, reads, statsScans }));
}

async function waitForText(container, text) {
  for (let i = 0; i < 30; i += 1) {
    if (container.textContent.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`texto ausente: ${text}`);
}

describe('loadNightSnapshot', () => {
  it('lê a noite uma vez e deriva placar e estatísticas dessa leitura', async () => {
    const roundId = await seedFinishedNight();
    const { result: snap, reads, statsScans } = await watchNightReads(() => loadNightSnapshot());

    const readonly = reads.filter((read) => read.mode === 'readonly');
    expect(readonly).toHaveLength(1);
    expect(readonly[0].names).toEqual(expect.arrayContaining(NIGHT_STORES));
    expect(statsScans).toBe(1);

    expect(snap.players.map((player) => player.name)).toEqual(['Ana', 'Bruno', 'Carla']);
    expect(snap.teams.map((team) => team.id).sort()).toEqual(['team-a', 'team-b']);
    expect(snap.matches.map((match) => match.id)).toEqual(['match-1']);
    expect(snap.rounds.some((round) => round.id === roundId)).toBe(true);
    expect(snap.meta.find((row) => row.key === 'activeRoundId')?.value).toBe(roundId);
    expect(snap.activeRoundId).toBe(roundId);
    expect(snap.player_stats).toHaveLength(2);
    for (const team of snap.teams) {
      for (const playerId of team.players) {
        expect(snap.players.some((player) => player.id === playerId)).toBe(true);
      }
    }

    expect(snap.roundStats.find((row) => row.playerId === 'carla')).toBeUndefined();
    expect(snap.roundStats.find((row) => row.playerId === 'ana')).toMatchObject({
      goals: 2,
      assists: 1,
      ownGoals: 0,
      wins: 1,
      losses: 0,
      draws: 0,
      matches: 1,
    });
    expect(snap.roundStats.find((row) => row.playerId === 'bruno')).toMatchObject({
      goals: 0,
      assists: 0,
      ownGoals: 1,
      wins: 0,
      losses: 1,
      draws: 0,
      matches: 1,
    });
    expect(snap.globalStats.find((row) => row.playerId === 'ana')).toMatchObject({
      goals: 2,
      assists: 1,
      wins: 1,
    });
    expect(snap.globalStats.find((row) => row.playerId === 'carla')).toMatchObject({
      goals: 0,
      assists: 0,
      wins: 0,
      losses: 0,
      matches: 0,
    });
    expect(snap.matchScores['match-1']).toEqual({
      teamA: 'team-a',
      teamB: 'team-b',
      scoreA: 3,
      scoreB: 0,
    });
  });
});

describe('tela da noite', () => {
  let container;
  let root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it('aplica um snapshot só: fila, placar e estatísticas sem reler stats', async () => {
    await seedFinishedNight();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const { statsScans, reads } = await watchNightReads(async () => {
      await act(async () => {
        root.render(<App />);
      });
      await waitForText(container, 'Ana');
      await waitForText(container, '3 × 0');

      const roundTab = container.querySelector('[data-testid=tab-round]');
      await act(async () => {
        roundTab.click();
      });
      await waitForText(container, 'Estatísticas da rodada');
      const anaRoundRow = [...container.querySelectorAll('tr')].find((row) =>
        row.textContent.includes('Ana')
      );
      expect(anaRoundRow?.textContent).toContain('2');

      const globalTab = container.querySelector('[data-testid=tab-global]');
      await act(async () => {
        globalTab.click();
      });
      await waitForText(container, 'Carla');
    });

    const readonly = reads.filter((read) => read.mode === 'readonly');
    expect(readonly.length).toBeGreaterThan(0);
    for (const read of readonly) {
      expect([...read.names].sort()).toEqual([...NIGHT_STORES].sort());
    }
    expect(statsScans).toBe(readonly.length);
    expect(container.textContent).toContain('Ana');
    expect(container.textContent).toContain('Carla');
  });
});
