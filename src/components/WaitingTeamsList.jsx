import React from 'react';
import TeamCard from './TeamCard.jsx';

/**
 * Fila de times `waiting` da rodada (ordem já definida por sortWaitingTeamsForRound).
 */
export default function WaitingTeamsList({
  teams,
  allPlayers,
  teamLabelById,
  playerFilaNumberById,
  waitingQueueIndexByTeamId,
  onEditTeam,
}) {
  if (teams.length === 0) {
    return <p className="empty-message">Nenhum time aguardando nesta rodada.</p>;
  }

  return (
    <div className="teams-grid">
      {teams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          allPlayers={allPlayers}
          playerFilaNumberById={playerFilaNumberById}
          label={teamLabelById[team.id] || 'Time'}
          waitingQueueIndex={waitingQueueIndexByTeamId[team.id]}
          onEditTeam={onEditTeam}
        />
      ))}
    </div>
  );
}
