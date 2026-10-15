import { describe, it, expect } from 'vitest';
import { suggestNextMatch } from '../src/domain/nextMatchEngine.js';

function fieldTeam(id, createdAt, players, extra = {}) {
  return {
    id,
    status: 'in_field',
    isBlocked: false,
    createdAt,
    players,
    roundId: 'r1',
    ...extra,
  };
}

describe('suggestNextMatch', () => {
  it('pula o time em campo mais antigo quando ele está bloqueado', () => {
    const teams = [
      fieldTeam('old', '2020-01-01T00:00:00.000Z', [1, 2, 3, 4, 5], { isBlocked: true }),
      fieldTeam('mid', '2020-02-01T00:00:00.000Z', [6, 7, 8, 9, 10]),
      fieldTeam('new', '2020-03-01T00:00:00.000Z', [11, 12, 13, 14, 15]),
    ];

    expect(suggestNextMatch(teams, 5)).toEqual({
      ok: true,
      teamAId: 'mid',
      teamBId: 'new',
    });
  });

  it('pula um time de 4 quando o tamanho é 5', () => {
    const teams = [
      fieldTeam('short', '2020-01-01T00:00:00.000Z', [1, 2, 3, 4]),
      fieldTeam('a', '2020-02-01T00:00:00.000Z', [5, 6, 7, 8, 9]),
      fieldTeam('b', '2020-03-01T00:00:00.000Z', [10, 11, 12, 13, 14]),
    ];

    expect(suggestNextMatch(teams, 5)).toEqual({
      ok: true,
      teamAId: 'a',
      teamBId: 'b',
    });
  });
});
