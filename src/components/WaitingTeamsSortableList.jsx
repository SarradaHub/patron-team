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
import TeamCard from './TeamCard.jsx';

function SortableTeamShell({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`team-card-sortable-wrap${isDragging ? ' team-card-sortable-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

/**
 * Fila de times waiting com arrastar para repriorizar (waitingOrder persistido).
 */
export default function WaitingTeamsSortableList({
  teams,
  allPlayers,
  teamLabelById,
  playerFilaNumberById,
  waitingQueueIndexByTeamId,
  onEditTeam,
  onReorderWaitingTeams,
}) {
  const itemIds = useMemo(() => teams.map((t) => t.id), [teams]);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event) => {
    if (!onReorderWaitingTeams) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = itemIds.indexOf(active.id);
    const newIndex = itemIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderWaitingTeams(arrayMove(itemIds, oldIndex, newIndex));
  };

  if (teams.length === 0) {
    return <p className="empty-message">Nenhum time aguardando nesta rodada.</p>;
  }

  const grid = (
    <div className="teams-grid teams-grid-sortable">
      {teams.map((team) => (
        <SortableTeamShell key={team.id} id={team.id}>
          <TeamCard
            team={team}
            allPlayers={allPlayers}
            playerFilaNumberById={playerFilaNumberById}
            label={teamLabelById[team.id] || 'Time'}
            waitingQueueIndex={waitingQueueIndexByTeamId[team.id]}
            onEditTeam={onEditTeam}
            stopMousePropagationOnActions
          />
        </SortableTeamShell>
      ))}
    </div>
  );

  return (
    <>
      {onReorderWaitingTeams && (
        <p className="teams-drag-hint">
          Arraste o card inteiro com o mouse para mudar a ordem dos próximos.
        </p>
      )}
      {onReorderWaitingTeams ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {grid}
          </SortableContext>
        </DndContext>
      ) : (
        grid
      )}
    </>
  );
}
