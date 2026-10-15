/**
 * MVP de sugestão de próxima partida (referência conceitual: SLF NextMatchGenerator).
 * Heurística local: dois times em campo, não bloqueados, mais antigos primeiro.
 */

import { rosterMeetsTeamSize } from './teamSize.js';

/**
 * @param {object[]} teams - times da rodada (já filtrados por roundId)
 * @param {number} [teamSize=5] — jogadores mínimos por time (mesmo limite de “Formar time”)
 * @returns {{ ok: true, teamAId: string, teamBId: string } | { ok: false, error: string }}
 */
export function suggestNextMatch(teams, teamSize = 5) {
  const inField = teams
    .filter(
      (t) => t.status === 'in_field' && !t.isBlocked && rosterMeetsTeamSize(t, teamSize)
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (inField.length < 2) {
    return {
      ok: false,
      error:
        'São necessários 2 times em campo (não bloqueados) com elenco completo para o limite de jogadores por time. Forme os times, ajuste o limite ou aguarde o fluxo da fila.',
    };
  }

  return {
    ok: true,
    teamAId: inField[0].id,
    teamBId: inField[1].id,
  };
}
