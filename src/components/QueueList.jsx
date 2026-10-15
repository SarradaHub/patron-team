import React, { useMemo } from 'react';

/**
 * QueueList — Fila FIFO (joinedAt). Status: em campo, próximo (time waiting), disponível, etc.
 *
 * @param {object} props
 * @param {Array} props.players
 * @param {function} props.onRemove — cansado fora de campo
 * @param {function} [props.onFieldTired] — cansado em campo, pede quem entra
 * @param {function} [props.onSubstitute] — troca de escalação
 * @param {Set<string>} [props.rosterPlayerIds]
 * @param {function} [props.onRestore] — lesionado/cansado → disponível (fim da fila)
 * @param {function} [props.onEditPlayer] — abre edição do nome do jogador
 * @param {function} [props.onDeletePlayer] — exclui o jogador (o caller confirma)
 * @param {object[]} [props.waitingTeams] — times `waiting` da rodada, já ordenados (ex.: sortWaitingTeamsForRound)
 */
function PlayerRow({
  player,
  index,
  statusText,
  statusClass,
  onRemove,
  onFieldTired,
  onSubstitute,
  onRoster = false,
  onRestore,
  onEditPlayer,
  onDeletePlayer,
}) {
  const sc = statusClass[player.status] || '';

  return (
    <li className={`player-item ${sc}`}>
      <span className="player-position">#{index + 1}</span>
      <span className="player-name">{player.name || '—'}</span>
      <span className="player-status">{statusText(player)}</span>
      {(onEditPlayer || onDeletePlayer) && (
        <div className="player-actions player-actions-edit">
          {onEditPlayer && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onEditPlayer(player)}
              aria-label={`Editar jogador ${player.name || ''}`.trim()}
            >
              Editar
            </button>
          )}
          {onDeletePlayer && (
            <button
              type="button"
              className="btn btn-outline btn-sm btn-danger-outline"
              onClick={() => onDeletePlayer(player.id)}
              aria-label={`Excluir jogador ${player.name || ''}`.trim()}
            >
              Excluir
            </button>
          )}
        </div>
      )}
      {player.status === 'in_field' && (
        <div className="player-actions">
          <button
            type="button"
            className="btn btn-queue-tired btn-queue-icon"
            onClick={() => onFieldTired?.(player)}
            title="Cansado — escolher quem entra"
            aria-label="Cansado — escolher quem entra"
          >
            Cansado
          </button>
          <button
            type="button"
            className="btn btn-queue-sub btn-queue-icon"
            onClick={() => onSubstitute?.(player)}
            title="Substituir — escolher jogador"
            aria-label="Substituir — escolher jogador"
          >
            Sub
          </button>
        </div>
      )}
      {player.status !== 'in_field' && player.status !== 'injured' && player.status !== 'tired' && (
        <div className="player-actions player-actions-bench">
          <button
            type="button"
            className="btn btn-queue-tired btn-queue-icon"
            onClick={() => onRemove(player.id, 'tired', false)}
            title="Cansado — marcar como cansado (fora de campo)"
            aria-label="Cansado — marcar como cansado (fora de campo)"
          >
            Cansado
          </button>
          {onRoster && (
            <button
              type="button"
              className="btn btn-queue-sub btn-queue-icon"
              onClick={() => onSubstitute?.(player)}
              title="Substituir — escolher jogador"
              aria-label="Substituir — escolher jogador"
            >
              Sub
            </button>
          )}
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
  onFieldTired,
  onSubstitute,
  rosterPlayerIds,
  onRestore,
  onEditPlayer,
  onDeletePlayer,
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
        <p className="empty-message">Nenhum jogador na fila. Adicione jogadores em Controles.</p>
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
              onFieldTired={onFieldTired}
              onSubstitute={onSubstitute}
              onRoster={rosterPlayerIds?.has(player.id)}
              onRestore={onRestore}
              onEditPlayer={onEditPlayer}
              onDeletePlayer={onDeletePlayer}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
