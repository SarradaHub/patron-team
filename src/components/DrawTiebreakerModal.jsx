import React from 'react';
import { labelMatchSide } from '../domain/teamLabels.js';
import ModalFrame from './ModalFrame.jsx';

/**
 * Empate com um time waiting na fila: escolher qual time (A ou B) leva vantagem na fila.
 */
export default function DrawTiebreakerModal({ match, teams, onPick, onCancel }) {
  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]));
  const sideLineA = labelMatchSide(match.teamA, 'A', teamMap);
  const sideLineB = labelMatchSide(match.teamB, 'B', teamMap);

  return (
    <ModalFrame onClose={onCancel}>
      <div className="modal-content match-stats-modal">
        <h3>Desempate na fila</h3>
        <p className="modal-sub">
          Há um time aguardando e o jogo empatou. <strong>Time A</strong> = esquerda no placar,{' '}
          <strong>Time B</strong> = direita. Escolha qual lado entra com prioridade na fila.
        </p>
        <div className="tiebreaker-actions">
          <div className="tiebreaker-picks-row">
            <button
              type="button"
              className="btn btn-match btn-a-win"
              onClick={() => onPick(match.teamA)}
            >
              Prioridade: {sideLineA}
            </button>
            <button
              type="button"
              className="btn btn-match btn-b-win"
              onClick={() => onPick(match.teamB)}
            >
              Prioridade: {sideLineB}
            </button>
          </div>
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
