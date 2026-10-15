import React, { useState, useEffect } from 'react';
import ModalFrame from './ModalFrame.jsx';

export default function EditPlayerModal({ player, onClose, onSave, onDelete }) {
  const [name, setName] = useState(player?.name ?? '');
  const [goalkeeperOnly, setGoalkeeperOnly] = useState(Boolean(player?.goalkeeperOnly));
  const [preferGoalkeeper, setPreferGoalkeeper] = useState(Boolean(player?.preferGoalkeeper));

  useEffect(() => {
    setName(player?.name ?? '');
    setGoalkeeperOnly(Boolean(player?.goalkeeperOnly));
    setPreferGoalkeeper(Boolean(player?.preferGoalkeeper));
  }, [player]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave(player.id, {
      name,
      goalkeeperOnly,
      preferGoalkeeper: goalkeeperOnly ? true : preferGoalkeeper,
    });
  };

  return (
    <ModalFrame onClose={onClose} labelledBy="edit-player-title">
      <div className="modal-content match-stats-modal">
        <h3 id="edit-player-title">Editar jogador</h3>
        <p className="modal-sub">Altere o nome exibido na fila e nos times.</p>
        <form onSubmit={handleSubmit}>
          <label className="modal-form-label" htmlFor="edit-player-name">
            Nome
          </label>
          <input
            id="edit-player-name"
            type="text"
            className="input-text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <label className="modal-form-label modal-checkbox-row" htmlFor="edit-player-gk-only">
            <input
              id="edit-player-gk-only"
              type="checkbox"
              checked={goalkeeperOnly}
              onChange={(e) => {
                const v = e.target.checked;
                setGoalkeeperOnly(v);
                if (v) setPreferGoalkeeper(true);
              }}
            />
            Só goleiro (fora da fila de linha e da formação automática)
          </label>
          <label className="modal-form-label modal-checkbox-row" htmlFor="edit-player-goalkeeper">
            <input
              id="edit-player-goalkeeper"
              type="checkbox"
              checked={preferGoalkeeper}
              disabled={goalkeeperOnly}
              onChange={(e) => setPreferGoalkeeper(e.target.checked)}
            />
            Aparecer também na lista de goleiros (jogador de linha)
          </label>
          <div className="modal-actions">
            {onDelete && (
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => onDelete(player.id)}
              >
                Excluir jogador
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
