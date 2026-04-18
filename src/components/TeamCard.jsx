import React from 'react';

/**
 * TeamCard — Exibe um card de time com a lista de jogadores.
 * Mostra o status do time e permite ações rápidas.
 *
 * @param {object} props
 * @param {object} props.team - Dados do time
 * @param {Array} props.allPlayers - Lista de todos os jogadores (para resolver nomes)
 * @param {string} props.label - Rótulo do time (ex.: "Time A", "Time B")
 * @param {function} [props.onToggleBlock] - alterna time bloqueado (próxima partida)
 * @param {function} [props.onEditTeam] - (team, defaultLabel) abre edição de rótulo
 * @param {number} [props.waitingQueueIndex] - posição na fila “próximos” (1-based), alinhada à ordem global
 * @param {Record<string, number>} [props.playerFilaNumberById] - # na fila de jogadores (mesma ordem que QueueList, sem só-goleiro)
 * @param {boolean} [props.stopMousePropagationOnActions] - evita iniciar DnD ao clicar nos botões (cards sortable)
 */
export default function TeamCard({
  team,
  allPlayers,
  label,
  onToggleBlock,
  onEditTeam,
  waitingQueueIndex,
  playerFilaNumberById = {},
  stopMousePropagationOnActions = false,
}) {
  // Cria um mapa de jogadores por ID para acesso rápido
  const playerMap = {};
  for (const p of allPlayers) {
    playerMap[p.id] = p;
  }

  const stopAct = stopMousePropagationOnActions
    ? (e) => {
        e.stopPropagation();
      }
    : undefined;

  const playerIdsOrdered =
    team.status === 'waiting'
      ? [...(team.players || [])].sort((pa, pb) => {
          const a = playerMap[pa];
          const b = playerMap[pb];
          if (!a?.joinedAt && !b?.joinedAt) return String(pa).localeCompare(String(pb));
          const ta = a?.joinedAt ? new Date(a.joinedAt).getTime() : Infinity;
          const tb = b?.joinedAt ? new Date(b.joinedAt).getTime() : Infinity;
          if (ta !== tb) return ta - tb;
          return String(pa).localeCompare(String(pb));
        })
      : team.players || [];

  return (
    <div
      className={`team-card ${team.status === 'in_field' ? 'team-active' : 'team-waiting'} ${
        team.isBlocked ? 'team-blocked' : ''
      }`}
    >
      <h3>
        {(team.displayName && team.displayName.trim()) || label || `Time`}{' '}
        <span className="team-status">
          {team.status === 'in_field' ? 'Em campo' : 'Aguardando'}
          {team.status === 'waiting' &&
            waitingQueueIndex != null &&
            !Number.isNaN(Number(waitingQueueIndex)) && (
              <span className="waiting-order"> · {waitingQueueIndex}º próximo</span>
            )}
          {team.isBlocked ? ' · Bloqueado' : ''}
        </span>
      </h3>
      <ul className="team-players">
        {playerIdsOrdered.map((pid) => {
          const player = playerMap[pid];
          const filaN = playerFilaNumberById[pid];
          return (
            <li key={pid} className="team-player-item">
              {filaN != null && (
                <span className="team-player-fila-num" title="Posição na fila de jogadores">
                  #{filaN}
                </span>
              )}
              {player ? player.name : `Jogador ${pid.slice(0, 8)}...`}
              {player && (
                <span className="player-badge">
                  {team.status === 'waiting' && player.status === 'available' && ' · fila'}
                  {player.status === 'injured' ? ' · Lesão' : ''}
                  {player.status === 'tired' ? ' · Cansado' : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="team-meta">
        Criado em: {new Date(team.createdAt).toLocaleString('pt-BR')}
      </p>
      <div className="team-card-actions">
        {onEditTeam && (
          <button
            type="button"
            className="btn btn-outline btn-sm team-edit-btn"
            onMouseDown={stopAct}
            onClick={() => onEditTeam(team, label || 'Time')}
          >
            Editar
          </button>
        )}
        {onToggleBlock && (
          <button
            type="button"
            className="btn btn-outline btn-sm team-block-btn"
            onMouseDown={stopAct}
            onClick={() => onToggleBlock(team.id)}
          >
            {team.isBlocked ? 'Desbloquear time' : 'Bloquear time'}
          </button>
        )}
      </div>
    </div>
  );
}

