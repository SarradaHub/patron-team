import React, { useState, useEffect, useMemo } from 'react';
import ModalFrame from './ModalFrame.jsx';

function teamOptionLabel(team, teamLabelById) {
  const n = team?.players?.length ?? 0;
  const custom = team?.displayName?.trim();
  const base = custom || teamLabelById?.[team?.id] || 'Time';
  return `${base} (${n} jog.)`;
}

export default function EditScheduledMatchModal({
  match,
  teams,
  teamLabelById = {},
  teamSize,
  onClose,
  onSave,
}) {
  const optionTeams = useMemo(() => {
    const min = teamSize || 1;
    const inRound = (teams || []).filter((t) => t.roundId === match.roundId);
    const byId = new Map(inRound.map((t) => [t.id, t]));
    const out = [];
    const push = (t) => {
      if (t && !out.some((x) => x.id === t.id)) out.push(t);
    };
    for (const t of inRound) {
      if ((t.players?.length ?? 0) >= min) push(t);
    }
    for (const id of [match.teamA, match.teamB]) {
      const t = byId.get(id);
      if (t) push(t);
    }
    return out;
  }, [teams, match.roundId, teamSize, match.teamA, match.teamB]);

  const [teamAId, setTeamAId] = useState(match.teamA);
  const [teamBId, setTeamBId] = useState(match.teamB);

  useEffect(() => {
    setTeamAId(match.teamA);
    setTeamBId(match.teamB);
  }, [match.id, match.teamA, match.teamB]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (teamAId === teamBId) {
      alert('Escolha dois times diferentes.');
      return;
    }
    await onSave(match.id, teamAId, teamBId);
  };

  return (
    <ModalFrame onClose={onClose} labelledBy="edit-match-title">
      <div className="modal-content match-stats-modal">
        <h3 id="edit-match-title">Editar partida agendada</h3>
        <p className="modal-sub">
          Troque os times (elenco mínimo: {teamSize} jogadores). Para remover a partida, use Excluir no card.
        </p>
        <form onSubmit={handleSubmit}>
          {optionTeams.length < 2 && (
            <p className="modal-sub warning-text">
              É necessário pelo menos dois times na rodada com elenco suficiente para trocar os
              adversários.
            </p>
          )}
          <div className="edit-match-selects edit-match-grid-ab">
            <div>
              <label className="modal-form-label" htmlFor="edit-match-team-a">
                Time A — esquerda (placar / stats)
              </label>
              <select
                id="edit-match-team-a"
                className="input-text"
                value={teamAId}
                onChange={(e) => setTeamAId(e.target.value)}
              >
                {optionTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {teamOptionLabel(t, teamLabelById)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="modal-form-label" htmlFor="edit-match-team-b">
                Time B — direita (placar / stats)
              </label>
              <select
                id="edit-match-team-b"
                className="input-text"
                value={teamBId}
                onChange={(e) => setTeamBId(e.target.value)}
              >
                {optionTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {teamOptionLabel(t, teamLabelById)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Fechar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={optionTeams.length < 2}
            >
              Salvar times
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
