import React from 'react';

function sortByJoinedAtAsc(players) {
  return [...players].sort((a, b) => {
    const ta = a?.joinedAt ? new Date(a.joinedAt).getTime() : Number.POSITIVE_INFINITY;
    const tb = b?.joinedAt ? new Date(b.joinedAt).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
}

function statusText(player) {
  switch (player.status) {
    case 'in_field':
      return 'Em campo';
    case 'injured':
      return 'Lesionado';
    case 'tired':
      return 'Cansado';
    default:
      return 'Disponível';
  }
}

export default function GoalkeeperQueuePanel({ players = [], onDeletePlayer }) {
  const goalkeeperPlayers = sortByJoinedAtAsc(
    players.filter((p) => Boolean(p.preferGoalkeeper))
  );

  return (
    <div className="panel queue-panel goalkeeper-panel">
      <h2>Lista de goleiros ({goalkeeperPlayers.length})</h2>
      {goalkeeperPlayers.length === 0 ? (
        <p className="empty-message">Nenhum goleiro. Marque Só goleiro ao adicionar um jogador.</p>
      ) : (
        <ul className="player-list">
          {goalkeeperPlayers.map((player, index) => (
            <li key={player.id} className="player-item">
              <span className="player-position">#{index + 1}</span>
              <span className="player-name">{player.name || '—'}</span>
              <span className="player-status">{statusText(player)}</span>
              {onDeletePlayer && (
                <div className="player-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-danger-outline"
                    onClick={() => onDeletePlayer(player)}
                    title={
                      player.goalkeeperOnly
                        ? 'Excluir goleiro (remove do cadastro)'
                        : 'Remover da lista de goleiros (jogador continua na fila de linha)'
                    }
                  >
                    Excluir
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
