import React, { useState } from 'react';
import { labelMatchSide } from '../domain/teamLabels.js';
import ConfirmDialog from './ConfirmDialog.jsx';

const RESULT_CONFIRM = {
  A_win: { label: 'Time A venceu', message: 'Finalizar como Time A venceu?' },
  B_win: { label: 'Time B venceu', message: 'Finalizar como Time B venceu?' },
  draw: { label: 'Empate', message: 'Finalizar como empate?' },
};

/**
 * Histórico de partidas da rodada (finalizadas e agendadas) com placar numérico.
 */
export default function MatchHistory({
  matches,
  teams,
  teamLabelById = {},
  matchScores,
  onEditStats,
  onEditScheduledMatch,
  onDeleteMatch,
  onFinalizeResult,
}) {
  const [pendingResult, setPendingResult] = useState(null);
  const teamMap = {};
  for (const t of teams) {
    teamMap[t.id] = t;
  }

  const resultClass = {
    A_win: 'result-a-win',
    B_win: 'result-b-win',
    draw: 'result-draw',
  };

  const sortedMatches = [...matches].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  const labelForTeam = (id) => {
    const t = teamMap[id];
    const fallback = teamLabelById[id] || 'Time';
    if (!t) return fallback;
    const tag = t.displayName?.trim() || fallback;
    return `${tag} (${t.players?.length || 0} jog.)`;
  };

  const teamWinName = (teamId, match) => {
    const t = teamMap[teamId];
    const side = teamId === match.teamA ? 'A' : 'B';
    return t?.displayName?.trim() || teamLabelById[teamId] || `Lado ${side}`;
  };

  const outcomeText = (match) => {
    if (!match.result) return '';
    if (match.result === 'draw') return 'Empate';
    const winId = match.result === 'A_win' ? match.teamA : match.teamB;
    return `${teamWinName(winId, match)} venceu`;
  };

  const scoreLine = (match) => {
    const s = matchScores?.[match.id];
    if (!s) return '— × —';
    return `${s.scoreA} × ${s.scoreB}`;
  };

  return (
    <div className="panel history-panel" data-testid="matches-panel">
      <h2>Partidas da rodada ({matches.length})</h2>
      {sortedMatches.length === 0 ? (
        <p className="empty-message">Nenhuma partida nesta rodada. Agende a próxima partida em Controles.</p>
      ) : (
        <ul className="match-list">
          {sortedMatches.map((match) => (
            <li
              key={match.id}
              className={`match-item ${
                match.status === 'scheduled' ? 'match-scheduled' : resultClass[match.result] || ''
              }`}
            >
              <div className="match-card-stack">
                <div className="match-line-teams match-line-teams--standard-ab">
                  <span className="match-line-team-slot match-line-team-slot--a">
                    {labelMatchSide(match.teamA, 'A', teamMap)}
                  </span>
                  <span className="match-line-vs" aria-hidden="true">
                    ×
                  </span>
                  <span className="match-line-team-slot match-line-team-slot--b">
                    {labelMatchSide(match.teamB, 'B', teamMap)}
                  </span>
                  {match.status === 'scheduled' && (
                    <span className="badge-scheduled">Agendada</span>
                  )}
                </div>
                <div className="match-line-score">
                  <span className="match-score-nums">{scoreLine(match)}</span>
                </div>
                <div className="match-line-time">
                  {new Date(match.timestamp).toLocaleString('pt-BR')}
                </div>
                <div className="match-line-stats">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => onEditStats(match)}
                  >
                    Stats
                  </button>
                  {match.status === 'scheduled' && onEditScheduledMatch && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => onEditScheduledMatch(match)}
                    >
                      Editar
                    </button>
                  )}
                  {onDeleteMatch && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-danger-outline"
                      onClick={() => onDeleteMatch(match.id, match.status)}
                    >
                      Excluir
                    </button>
                  )}
                </div>
                {match.status === 'scheduled' && onFinalizeResult && (
                  <div className="match-line-finalize">
                    <button
                      type="button"
                      className="btn btn-match btn-a-win"
                      onClick={() => setPendingResult({ match, result: 'A_win' })}
                    >
                      Time A venceu
                    </button>
                    <button
                      type="button"
                      className="btn btn-match btn-b-win"
                      onClick={() => setPendingResult({ match, result: 'B_win' })}
                    >
                      Time B venceu
                    </button>
                    <button
                      type="button"
                      className="btn btn-match btn-draw"
                      onClick={() => setPendingResult({ match, result: 'draw' })}
                    >
                      Empate
                    </button>
                  </div>
                )}
                {match.status === 'finalized' && match.result && (
                  <div className="match-line-result-outcome">
                    <span className="match-score-result">{outcomeText(match)}</span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {pendingResult && (
        <ConfirmDialog
          title="Confirmar resultado"
          message={RESULT_CONFIRM[pendingResult.result].message}
          confirmLabel={RESULT_CONFIRM[pendingResult.result].label}
          onCancel={() => setPendingResult(null)}
          onConfirm={() => {
            const { match, result } = pendingResult;
            setPendingResult(null);
            onFinalizeResult?.(match, result);
          }}
        />
      )}
    </div>
  );
}
