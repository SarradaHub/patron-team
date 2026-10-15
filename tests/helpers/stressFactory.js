/**
 * Helpers for stress / load tests against IndexedDB API.
 * Deterministic RNG for reproducible runs.
 */

import { getMatches } from '../../src/api/indexeddb.js';

/** @returns {() => number} uniform [0,1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickResult(rng) {
  const r = rng();
  if (r < 0.15) return 'draw';
  if (r < 0.575) return 'A_win';
  return 'B_win';
}

export async function seedPlayers(addPlayer, count, prefix) {
  for (let i = 1; i <= count; i += 1) {
    await addPlayer(`${prefix}${i}`);
  }
}

export async function ensureTwoInField(getTeams, formTeam, roundId, teamSize) {
  let teams = await getTeams(roundId);
  let inField = teams.filter((t) => t.status === 'in_field');
  while (inField.length < 2) {
    await formTeam(teamSize, roundId);
    teams = await getTeams(roundId);
    inField = teams.filter((t) => t.status === 'in_field');
  }
  return inField;
}

export async function playFinalizedMatch(
  scheduleMatch,
  finalizeMatch,
  getTeams,
  formTeam,
  roundId,
  teamSize,
  result
) {
  const open = (await getMatches(roundId)).find((m) => m.status === 'scheduled');
  let match = open;
  if (!match) {
    const inField = await ensureTwoInField(getTeams, formTeam, roundId, teamSize);
    match = await scheduleMatch(roundId, inField[0].id, inField[1].id, { teamSize });
  }
  await finalizeMatch(match.id, result, { teamSize });
  return match;
}

/**
 * Each player id appears in at most one team roster (all rounds).
 */
export async function assertNoPlayerOnMultipleTeams(getTeams) {
  const allTeams = await getTeams(null);
  const owner = new Map();
  for (const t of allTeams) {
    for (const pid of t.players || []) {
      const key = String(pid);
      if (owner.has(key)) {
        throw new Error(`Player ${key} on multiple teams: ${owner.get(key)} and ${t.id}`);
      }
      owner.set(key, t.id);
    }
  }
}

/**
 * Roster ids exist as players; optional check player status matches roster membership for round.
 */
export async function assertRostersReferenceExistingPlayers(getPlayers, getTeams, roundId) {
  const players = await getPlayers(false);
  const byId = new Map(players.map((p) => [String(p.id), p]));
  const teams = await getTeams(roundId);
  for (const t of teams) {
    for (const pid of t.players || []) {
      if (!byId.has(String(pid))) {
        throw new Error(`Team ${t.id} references missing player ${pid}`);
      }
    }
  }
}
