import React, { useMemo } from 'react';

/**
 * QueueList — Fila FIFO (joinedAt). Status: em campo, próximo (time waiting), disponível, etc.
 *
 * @param {object} props
 * @param {Array} props.players
 * @param {function} props.onRemove
 * @param {function} [props.onRestore] — lesionado/cansado → disponível (fim da fila)
 * @param {function} [props.onEditPlayer] — abre edição do nome do jogador
 * @param {object[]} [props.waitingTeams] — times `waiting` da rodada, já ordenados (ex.: sortWaitingTeamsForRound)
 */
function PlayerRow({
  player,
  index,
  statusText,
  statusClass,
  onRemove,
  onRestore,
  onEditPlayer,
}) {
  const sc = statusClass[player.status] || '';

  return (
    <li className={`player-item ${sc}`}>
      <span className="player-position">#{index + 1}</span>
      <span className="player-name">{player.name || '—'}</span>
      <span className="player-status">{statusText(player)}</span>
      {onEditPlayer && (
        <div className="player-actions player-actions-edit">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onEditPlayer(player)}
          >
            Editar
          </button>
        </div>
      )}
      {player.status === 'in_field' && (
        <div className="player-actions">
          <button
            type="button"
            className="btn btn-queue-injury btn-queue-icon"
            onClick={() => onRemove(player.id, 'injured', false)}
            title="Lesão — marcar como lesionado"
            aria-label="Lesão — marcar como lesionado"
          >
            {'\u{1F915}'}
          </button>
          <button
            type="button"
            className="btn btn-queue-tired btn-queue-icon"
            onClick={() => onRemove(player.id, 'tired', false)}
            title="Cansado — marcar como cansado"
            aria-label="Cansado — marcar como cansado"
          >
            {'\u{1F613}'}
          </button>
          <button
            type="button"
            className="btn btn-queue-sub btn-queue-icon"
            onClick={() => onRemove(player.id, 'tired', true)}
            title="Substituir — próximo da fila"
            aria-label="Substituir — próximo da fila"
          >
            {'\u{1F504}'}
          </button>
        </div>
      )}
      {player.status !== 'in_field' && player.status !== 'injured' && player.status !== 'tired' && (
        <div className="player-actions player-actions-bench">
          <button
            type="button"
            className="btn btn-queue-injury btn-queue-icon"
            onClick={() => onRemove(player.id, 'injured', false)}
            title="Lesão — marcar como lesionado (fora de campo)"
            aria-label="Lesão — marcar como lesionado (fora de campo)"
          >
            {'\u{1F915}'}
          </button>
          <button
            type="button"
            className="btn btn-queue-tired btn-queue-icon"
            onClick={() => onRemove(player.id, 'tired', false)}
            title="Cansado — marcar como cansado (fora de campo)"
            aria-label="Cansado — marcar como cansado (fora de campo)"
          >
            {'\u{1F613}'}
          </button>
        </div>
      )}
      {(player.status === 'tired' || player.status === 'injured') && onRestore && (
        <div className="player-actions player-actions-restore">
          <button
            type="button"
            className="btn btn-outline btn-sm btn-queue-restore"
            onClick={() => onRestore(player.id)}
            title={
              player.status === 'tired'
                ? 'Liberar cansaço — volta como disponível no fim da fila'
                : 'Liberar lesão — volta como disponível no fim da fila'
            }
          >
            {player.status === 'tired' ? 'Liberar cansaço' : 'Liberar lesão'}
          </button>
        </div>
      )}
    </li>
  );
}

export default function QueueList({
  players,
  onRemove,
  onRestore,
  onEditPlayer,
  waitingTeams = [],
}) {
  const waitingNumberByPlayerId = useMemo(() => {
    const m = new Map();
    waitingTeams.forEach((team, idx) => {
      const n = idx + 1;
      for (const pid of team.players || []) {
        m.set(pid, n);
      }
    });
    return m;
  }, [waitingTeams]);

  const statusText = (player) => {
    switch (player.status) {
      case 'in_field':
        return 'Em campo';
      case 'injured':
        return 'Lesionado';
      case 'tired':
        return 'Cansado';
      default: {
        const n = waitingNumberByPlayerId.get(player.id);
        if (n != null) return `Próximo nº ${n}`;
        return 'Disponível';
      }
    }
  };

  const statusClass = {
    available: 'status-available',
    in_field: 'status-in-field',
    injured: 'status-injured',
    tired: 'status-tired',
  };

  return (
    <div className="panel queue-panel" data-testid="queue-panel">
      <h2>Fila de Jogadores ({players.length})</h2>
      {players.length === 0 ? (
        <p className="empty-message">Nenhum jogador na fila. Adicione jogadores para começar!</p>
      ) : (
        <ul className="player-list">
          {players.map((player, index) => (
            <PlayerRow
              key={player.id}
              player={player}
              index={index}
              statusText={statusText}
              statusClass={statusClass}
              onRemove={onRemove}
              onRestore={onRestore}
              onEditPlayer={onEditPlayer}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
