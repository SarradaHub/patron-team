import React from 'react';
import TeamCard from './TeamCard.jsx';

/**
 * Fila de times `waiting` da rodada (ordem já definida por sortWaitingTeamsForRound).
 */
export default function WaitingTeamsList({
  teams,
  allPlayers,
  teamLabelById,
  sideByTeamId = {},
  playerFilaNumberById,
  waitingQueueIndexByTeamId,
  onEditTeam,
  onDeleteTeam,
}) {
  if (teams.length === 0) {
    return <p className="empty-message">Nenhum time aguardando. Forme times em Controles para encher a fila.</p>;
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
          side={sideByTeamId[team.id]}
          waitingQueueIndex={waitingQueueIndexByTeamId[team.id]}
          onEditTeam={onEditTeam}
          onDeleteTeam={onDeleteTeam}
        />
      ))}
    </div>
  );
}
