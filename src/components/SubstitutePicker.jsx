import React from 'react';
import ModalFrame from './ModalFrame.jsx';

export default function SubstitutePicker({ title, message, candidates, onPick, onCancel }) {
  return (
    <ModalFrame onClose={onCancel} labelledBy="substitute-picker-title">
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <h3 id="substitute-picker-title">{title}</h3>
        <p className="modal-sub">{message}</p>
        {candidates.length === 0 ? (
          <p className="empty-message">Nenhum jogador disponível.</p>
        ) : (
          <ul className="substitute-picker-list">
            {candidates.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onPick(player)}
                >
                  {player.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
