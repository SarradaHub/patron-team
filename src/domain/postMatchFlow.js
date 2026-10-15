/**
 * Planeja próxima partida automática após finalização (estado já persistido).
 * waiting = status === 'waiting', ordenados por fila global (joinedAt) em waitingQueueOrder.js.
 */

import { sortWaitingTeamsForRound } from './waitingQueueOrder.js';

function winnerLoserFromResult(match, result) {
  if (result === 'A_win') return { winnerId: match.teamA, loserId: match.teamB };
  if (result === 'B_win') return { winnerId: match.teamB, loserId: match.teamA };
  return { winnerId: null, loserId: null };
}

function rosterMeetsTeamSize(team, teamSize) {
  if (!teamSize || teamSize < 1) return true;
  return (team?.players?.length ?? 0) >= teamSize;
}

/**
 * Jogadores available: primeiro os que já estão em algum time da rodada (FIFO joinedAt),
 * depois os demais available (fila geral), para completar times sem time “banco” explícito.
 * @param {object[]} players
 * @param {string[]} playerIdsInRound — união dos players dos times da rodada
 */
export function availablePlayersFifo(players, playerIdsInRound) {
  const inRound = new Set(playerIdsInRound);
  const byJoined = (a, b) => new Date(a.joinedAt) - new Date(b.joinedAt);
  const inR = players.filter((p) => inRound.has(p.id) && p.status === 'available').sort(byJoined);
  const outR = players.filter((p) => !inRound.has(p.id) && p.status === 'available').sort(byJoined);
  return [...inR, ...outR];
}

/**
 * @param {object} ctx
 * @param {object} ctx.match — { teamA, teamB }
 * @param {'A_win'|'B_win'|'draw'} ctx.result
 * @param {object[]} ctx.teams — snapshot pós-finalização
 * @param {object[]} ctx.players
 * @param {number} ctx.teamSize
 * @param {string[]} ctx.preWaitingTeamIds — ids dos times waiting antes de finalizar (ordenados FIFO)
 * @param {string|null} ctx.tiebreakerWinnerTeamId — teamA | teamB se empate + 1 waiting pré
 * @returns {object} plano aplicado dentro de finalizeMatch
 */
export function planNextMatch(ctx) {
  const { match, result, teams, players, teamSize, preWaitingTeamIds, tiebreakerWinnerTeamId } =
    ctx;
  const preWaitingCount = preWaitingTeamIds?.length ?? 0;
  const roundId = teams[0]?.roundId || ctx.roundId;
  if (!roundId) return { type: 'none', reason: 'sem_round' };

  const playerIdsInRound = [
    ...new Set(teams.filter((t) => t.roundId === roundId).flatMap((t) => t.players || [])),
  ];

  const waitingSorted = sortWaitingTeamsForRound(teams, roundId, players, teamSize);
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]));

  if (result === 'draw') {
    if (preWaitingCount === 1) {
      const onWaitingRoster = new Set(
        teams.filter((t) => t.status === 'waiting').flatMap((t) => t.players || []),
      );
      const freeQueue = availablePlayersFifo(players, playerIdsInRound).filter(
        (p) => !onWaitingRoster.has(p.id),
      );
      if (freeQueue.length < teamSize) {
        return { type: 'none', reason: 'fila_insuficiente_empate_1_waiting' };
      }
      const newPlayerIds = freeQueue.slice(0, teamSize).map((p) => p.id);
      const w = teams.find((t) => t.id === preWaitingTeamIds[0]);
      if (!w || w.status !== 'waiting') return { type: 'none', reason: 'sem_waiting' };
      if (!tiebreakerWinnerTeamId || ![match.teamA, match.teamB].includes(tiebreakerWinnerTeamId)) {
        return { type: 'none', reason: 'tiebreaker_obrigatorio' };
      }
      return {
        type: 'draw_one_waiting',
        waitingTeamId: w.id,
        newTeamPlayerIds: newPlayerIds,
        tiebreakerWinnerTeamId,
        match,
      };
    }
    if (waitingSorted.length >= 2) {
      const wa = waitingSorted[0];
      const wb = waitingSorted[1];
      if (!rosterMeetsTeamSize(wa, teamSize) || !rosterMeetsTeamSize(wb, teamSize)) {
        return { type: 'none', reason: 'waiting_elenco_incompleto' };
      }
      return {
        type: 'schedule',
        teamAId: wa.id,
        teamBId: wb.id,
      };
    }
    return { type: 'none', reason: 'waiting_insuficiente_empate' };
  }

  const { winnerId, loserId } = winnerLoserFromResult(match, result);
  if (!winnerId || !loserId) return { type: 'none', reason: 'sem_vencedor' };

  const loserTeam = byId[loserId];

  if (waitingSorted.length === 1) {
    const sole = waitingSorted[0];
    if (sole.players.length >= teamSize) {
      const winnerTeam = byId[winnerId];
      if (!winnerTeam) return { type: 'none', reason: 'time_vencedor_ausente' };
      if (!rosterMeetsTeamSize(winnerTeam, teamSize) || !rosterMeetsTeamSize(sole, teamSize)) {
        return { type: 'none', reason: 'elenco_incompleto_agenda' };
      }
      return { type: 'schedule', teamAId: winnerId, teamBId: sole.id };
    }
    if (!loserTeam) return { type: 'none', reason: 'time_perdedor_ausente' };
    const avail = availablePlayersFifo(players, playerIdsInRound);
    const loserOrder = [...(loserTeam.players || [])];
    const pool = [];
    const seen = new Set();
    for (const pid of sole.players) {
      if (!seen.has(pid)) {
        seen.add(pid);
        pool.push(pid);
      }
    }
    for (const p of avail) {
      if (pool.length >= teamSize) break;
      if (!seen.has(p.id)) {
        seen.add(p.id);
        pool.push(p.id);
      }
    }
    for (const pid of loserOrder) {
      if (pool.length >= teamSize) break;
      if (!seen.has(pid)) {
        seen.add(pid);
        pool.push(pid);
      }
    }
    if (pool.length < teamSize) {
      return { type: 'none', reason: 'jogadores_insuficientes_montar_time' };
    }
    return {
      type: 'resize_waiting_schedule',
      winnerId,
      waitingTeamId: sole.id,
      mergedPlayerIds: pool.slice(0, teamSize),
    };
  }

  if (waitingSorted.length >= 2) {
    const w0 = waitingSorted[0];
    const winnerTeam = byId[winnerId];
    if (!rosterMeetsTeamSize(winnerTeam, teamSize) || !rosterMeetsTeamSize(w0, teamSize)) {
      return { type: 'none', reason: 'elenco_incompleto_agenda' };
    }
    return {
      type: 'schedule',
      teamAId: winnerId,
      teamBId: w0.id,
    };
  }

  return { type: 'none', reason: 'sem_oponente_waiting' };
}
