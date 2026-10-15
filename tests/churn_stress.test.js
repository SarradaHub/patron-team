/**
 * Churn stress: frequent tired/injured + substitution during match loop.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addPlayer,
  getPlayers,
  getTeams,
  getMatches,
  formTeam,
  scheduleMatch,
  finalizeMatch,
  removePlayer,
  restorePlayerToAvailable,
  deleteDatabase,
  ensureDefaultActiveRound,
  getActiveRoundId,
} from '../src/api/indexeddb.js';
import {
  ensureTwoInField,
  assertNoPlayerOnMultipleTeams,
  assertRostersReferenceExistingPlayers,
} from './helpers/stressFactory.js';

beforeEach(async () => {
  await deleteDatabase();
});

describe('stress: churn', () => {
  it('alterna fadiga/lesão e substituição a cada 2 partidas durante 25 jogos', async () => {
    await ensureDefaultActiveRound();
    const rid = await getActiveRoundId();
    const teamSize = 5;

    for (let i = 1; i <= 48; i += 1) {
      await addPlayer(`ChurnP${i}`);
    }

    await formTeam(teamSize, rid);
    await formTeam(teamSize, rid);

    let substitutions = 0;
    const churned = new Set();

    for (let m = 1; m <= 25; m += 1) {
      await ensureTwoInField(getTeams, formTeam, rid, teamSize);
      const teams = await getTeams(rid);
      const inField = teams.filter((t) => t.status === 'in_field');
      const open = (await getMatches(rid)).find((m) => m.status === 'scheduled');
      const match =
        open ?? (await scheduleMatch(rid, inField[0].id, inField[1].id, { teamSize }));
      const result = m % 3 === 0 ? 'draw' : m % 2 === 0 ? 'B_win' : 'A_win';
      await finalizeMatch(match.id, result, { teamSize });

      if (m % 2 === 0) {
        let after = await getTeams(rid);
        let inf = after.filter((t) => t.status === 'in_field');
        while (inf.length < 2) {
          await formTeam(teamSize, rid);
          after = await getTeams(rid);
          inf = after.filter((t) => t.status === 'in_field');
        }

        const reason = m % 4 === 0 ? 'injured' : 'tired';
        const players = await getPlayers(false);
        const victim =
          players.find((p) => p.status === 'in_field' && !churned.has(p.id)) ||
          players.find((p) => p.status === 'in_field');
        expect(victim).toBeDefined();

        const out = await removePlayer(victim.id, reason, true, rid, teamSize);
        expect(out.substituted).toBe(true);
        substitutions += 1;
        churned.add(victim.id);
      }

      if (m % 7 === 0 && churned.size > 0) {
        const tiredList = (await getPlayers(false)).filter((p) => p.status === 'tired');
        if (tiredList[0]) {
          await restorePlayerToAvailable(tiredList[0].id);
        }
      }
    }

    await assertNoPlayerOnMultipleTeams(getTeams);
    await assertRostersReferenceExistingPlayers(getPlayers, getTeams, rid);

    const finalized = (await getMatches(rid)).filter((x) => x.status === 'finalized');
    expect(finalized.length).toBe(25);
    expect(substitutions).toBeGreaterThanOrEqual(10);

    const sidelined = (await getPlayers(false)).filter((p) =>
      ['tired', 'injured'].includes(p.status)
    );
    expect(sidelined.length).toBeGreaterThan(0);
  });
});
