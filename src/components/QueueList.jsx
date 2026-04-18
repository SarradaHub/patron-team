import React, { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * QueueList — Fila FIFO (joinedAt). Status: em campo, próximo (time waiting), disponível, etc.
 * Jogadores `available` podem ser arrastados para repriorizar joinedAt (persistido).
 *
 * @param {object} props
 * @param {Array} props.players
 * @param {function} props.onRemove
 * @param {function} [props.onRestore] — lesionado/cansado → disponível (fim da fila)
 * @param {function} [props.onEditPlayer] — abre edição do nome do jogador
 * @param {object[]} [props.waitingTeams] — times `waiting` da rodada, já ordenados (ex.: sortWaitingTeamsForRound)
 * @param {function} [props.onReorderLinePlayers] — (orderedIds: string[]) => Promise|void
 */
function SortablePlayerRow({
  player,
  index,
  sortableDisabled,
  statusText,
  statusClass,
  onRemove,
  onRestore,
  onEditPlayer,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
    disabled: sortableDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };
  const sc = statusClass[player.status] || '';
  const stopDrag = (e) => e.stopPropagation();
  const rowTitle = sortableDisabled
    ? 'Só jogadores disponíveis podem ser arrastados'
    : player.joinedAt
      ? `Arrastar o card para repriorizar. FIFO (joinedAt): ${player.joinedAt}`
      : 'Arrastar o card para repriorizar fila';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`player-item ${sc}${isDragging ? ' player-item-dragging' : ''}${
        sortableDisabled ? '' : ' player-item-draggable'
      }`}
      title={sortableDisabled ? undefined : rowTitle}
      {...(sortableDisabled ? {} : { ...attributes, ...listeners })}
    >
      <span className="player-position">#{index + 1}</span>
      <span className="player-name">{player.name || '—'}</span>
      <span className="player-status">{statusText(player)}</span>
      {onEditPlayer && (
        <div className="player-actions player-actions-edit">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onMouseDown={stopDrag}
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
            onMouseDown={stopDrag}
            onClick={() => onRemove(player.id, 'injured', false)}
            title="Lesão — marcar como lesionado"
            aria-label="Lesão — marcar como lesionado"
          >
            {'\u{1F915}'}
          </button>
          <button
            type="button"
            className="btn btn-queue-tired btn-queue-icon"
            onMouseDown={stopDrag}
            onClick={() => onRemove(player.id, 'tired', false)}
            title="Cansado — marcar como cansado"
            aria-label="Cansado — marcar como cansado"
          >
            {'\u{1F613}'}
          </button>
          <button
            type="button"
            className="btn btn-queue-sub btn-queue-icon"
            onMouseDown={stopDrag}
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
            onMouseDown={stopDrag}
            onClick={() => onRemove(player.id, 'injured', false)}
            title="Lesão — marcar como lesionado (fora de campo)"
            aria-label="Lesão — marcar como lesionado (fora de campo)"
          >
            {'\u{1F915}'}
          </button>
          <button
            type="button"
            className="btn btn-queue-tired btn-queue-icon"
            onMouseDown={stopDrag}
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
            onMouseDown={stopDrag}
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
  onReorderLinePlayers,
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

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));

  const itemIds = useMemo(() => players.map((p) => p.id), [players]);

  const handleDragEnd = (event) => {
    if (!onReorderLinePlayers) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = itemIds.indexOf(active.id);
    const newIndex = itemIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(itemIds, oldIndex, newIndex);
    onReorderLinePlayers(next);
  };

  const listBody = (
    <ul className="player-list">
      {players.map((player, index) => (
        <SortablePlayerRow
          key={player.id}
          player={player}
          index={index}
          sortableDisabled={player.status !== 'available'}
          statusText={statusText}
          statusClass={statusClass}
          onRemove={onRemove}
          onRestore={onRestore}
          onEditPlayer={onEditPlayer}
        />
      ))}
    </ul>
  );

  return (
    <div className="panel queue-panel" data-testid="queue-panel">
      <h2>Fila de Jogadores ({players.length})</h2>
      {onReorderLinePlayers && players.some((p) => p.status === 'available') && (
        <p className="queue-drag-hint">
          Arraste o card do jogador (inteiro) com o mouse para repriorizar quem está disponível.
        </p>
      )}
      {players.length === 0 ? (
        <p className="empty-message">Nenhum jogador na fila. Adicione jogadores para começar!</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {listBody}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
