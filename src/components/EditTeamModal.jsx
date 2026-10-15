import React, { useState, useEffect, useMemo } from 'react';
import ModalFrame from './ModalFrame.jsx';

function isStatusAvailableForAdd(v) {
  if (v === 'available') return true;
  if (typeof v === 'string' && v.toLowerCase() === 'available') return true;
  return false;
}

export default function EditTeamModal({
  team,
  defaultLabel,
  allPlayers = [],
  roundTeams = [],
  teamSize = 5,
  onClose,
  onSave,
  onDelete,
}) {
  const [text, setText] = useState(team?.displayName ?? '');
  const [rosterIds, setRosterIds] = useState(() => [...(team?.players || [])]);
  const [addId, setAddId] = useState('');

  useEffect(() => {
    setText(team?.displayName ?? '');
    setRosterIds([...(team?.players || [])]);
    setAddId('');
  }, [team]);

  const nameById = useMemo(() => {
    const m = {};
    for (const p of allPlayers) {
      m[p.id] = p.name || p.id.slice(0, 8);
    }
    return m;
  }, [allPlayers]);

  const originalRoster = team?.players || [];

  const eligibleToAdd = useMemo(() => {
    const others = new Set();
    for (const t of roundTeams) {
      if (!team || t.id === team.id) continue;
      for (const pid of t.players || []) {
        others.add(pid);
      }
    }
    const removedFromOriginal = originalRoster.filter((id) => !rosterIds.includes(id));
    const list = [];
    for (const p of allPlayers) {
      if (rosterIds.includes(p.id)) continue;
      if (others.has(p.id)) continue;
      if (removedFromOriginal.includes(p.id)) {
        list.push(p);
        continue;
      }
      if (isStatusAvailableForAdd(p.status)) {
        list.push(p);
      }
    }
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    return list;
  }, [allPlayers, roundTeams, rosterIds, originalRoster, team]);

  const move = (index, dir) => {
    setRosterIds((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const removeAt = (index) => {
    setRosterIds((prev) => prev.filter((_, i) => i !== index));
  };

  const addSelected = () => {
    if (!addId) return;
    setRosterIds((prev) => [...prev, addId]);
    setAddId('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave(team.id, { displayName: text.trim(), playerIds: rosterIds });
  };

  const handleClearLabel = async () => {
    setText('');
    await onSave(team.id, { displayName: '', playerIds: rosterIds });
  };

  return (
    <ModalFrame onClose={onClose} labelledBy="edit-team-title">
      <div className="modal-content match-stats-modal edit-team-modal">
        <h3 id="edit-team-title">Editar time</h3>
        <p className="modal-sub">
          Rótulo opcional (substitui &quot;{defaultLabel || 'Time'}&quot; no card). Ajuste o elenco com a
          ordem do card (cima/baixo). Quem sai volta à fila geral ao salvar.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="modal-form-label" htmlFor="edit-team-display">
            Nome de exibição
          </label>
          <input
            id="edit-team-display"
            type="text"
            className="input-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={defaultLabel || 'Time'}
            autoComplete="off"
            autoFocus
          />

          <h4 className="edit-team-section-title">Elenco ({rosterIds.length})</h4>
          {rosterIds.length === 0 && (
            <p className="modal-sub warning-text">Inclua pelo menos um jogador.</p>
          )}
          <ul className="edit-team-roster-list">
            {rosterIds.map((pid, index) => (
              <li key={pid} className="edit-team-roster-row">
                <span className="edit-team-roster-name">{nameById[pid] || pid.slice(0, 8)}</span>
                <span className="edit-team-roster-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Subir"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={index === rosterIds.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Descer"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => removeAt(index)}
                  >
                    Remover
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="edit-team-add-row">
            <label className="modal-form-label" htmlFor="edit-team-add-player">
              Adicionar jogador
            </label>
            <div className="edit-team-add-controls">
              <select
                id="edit-team-add-player"
                className="input-text"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              >
                <option value="">— Escolher —</option>
                {eligibleToAdd.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={addSelected}
                disabled={!addId}
              >
                Adicionar
              </button>
            </div>
            {eligibleToAdd.length === 0 && rosterIds.length > 0 && (
              <p className="modal-sub">Não há jogadores disponíveis para adicionar (fila ou outros times).</p>
            )}
          </div>

          <p className="modal-sub">
            Mínimo sugerido: {teamSize} jogadores se houver partida agendada com este time.
          </p>

          <div className="modal-actions">
            {onDelete && (
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => onDelete(team.id)}
              >
                Excluir time
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={handleClearLabel}>
              Limpar rótulo
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={rosterIds.length === 0}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
