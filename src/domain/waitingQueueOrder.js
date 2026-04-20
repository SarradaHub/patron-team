/**
 * Ordem da fila de times `waiting`:
 * 1) Times com elenco completo (players.length >= rosterTargetSize) antes dos incompletos,
 *    quando rosterTargetSize é informado (ex.: mesmo “Jogadores por time” da UI).
 * 2) Entre o mesmo grupo: waitingOrder (menor primeiro; ordem manual persistida 1..n quando aplicável).
 * 3) Desempate: menor joinedAt no elenco (cabeça da fila global), enteredWaitingAt, id.
 */

function waitingOrderRank(t) {
  const n = Number(t.waitingOrder);
  return !Number.isNaN(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

function isIncompleteRoster(team, rosterTargetSize) {
  if (rosterTargetSize == null || rosterTargetSize < 1) return false;
  return (team?.players?.length ?? 0) < rosterTargetSize;
}

export function earliestJoinedInTeamMs(team, playerById) {
  let m = Infinity;
  for (const pid of team.players || []) {
    const p = playerById[pid];
    if (p?.joinedAt) {
      const t = new Date(p.joinedAt).getTime();
      if (!Number.isNaN(t) && t < m) m = t;
    }
  }
  return m;
}

export function compareWaitingTeamsQueueOrder(
  a,
  b,
  playerById,
  rosterTargetSize = null
) {
  if (rosterTargetSize != null && rosterTargetSize >= 1) {
    const aInc = isIncompleteRoster(a, rosterTargetSize);
    const bInc = isIncompleteRoster(b, rosterTargetSize);
    if (aInc !== bInc) return aInc ? 1 : -1;
  }

  const oa = waitingOrderRank(a);
  const ob = waitingOrderRank(b);
  if (oa !== ob) return oa - ob;

  const ea = earliestJoinedInTeamMs(a, playerById);
  const eb = earliestJoinedInTeamMs(b, playerById);
  if (ea !== eb) return ea - eb;

  const ta = new Date(a.enteredWaitingAt || a.createdAt).getTime();
  const tb = new Date(b.enteredWaitingAt || b.createdAt).getTime();
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * Times em espera da rodada, ordenados para fila justa vs. jogadores disponíveis.
 * @param {object[]} teams
 * @param {string} roundId
 * @param {object[]} [players]
 * @param {number|null} [rosterTargetSize] — ex.: jogadores por time; incompletos ficam por último
 */
export function sortWaitingTeamsForRound(teams, roundId, players = [], rosterTargetSize = null) {
  const playerById = Object.fromEntries((players || []).map((p) => [p.id, p]));
  return teams
    .filter((t) => t.roundId === roundId && t.status === 'waiting')
    .sort((a, b) => compareWaitingTeamsQueueOrder(a, b, playerById, rosterTargetSize));
}
