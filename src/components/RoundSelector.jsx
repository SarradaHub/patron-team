import React, { useEffect, useState } from 'react';

/**
 * Exibe e renomeia a rodada ativa (sem criar novas).
 * Múltiplas rodadas só por import legado.
 */
export default function RoundSelector({ rounds, activeRoundId, onSelectRound, onRenameRound }) {
  const active = rounds.find((r) => r.id === activeRoundId);
  const [draft, setDraft] = useState(active?.name ?? '');

  useEffect(() => {
    setDraft(active?.name ?? '');
  }, [active?.id, active?.name]);

  const commit = () => {
    if (!active || !onRenameRound) return;
    if (draft.trim() === (active.name || '').trim()) return;
    onRenameRound(active.id, draft);
  };

  const nameField = (
    <div className="round-name-field">
      <label htmlFor="round-name">Nome da rodada</label>
      <input
        id="round-name"
        className="input-text"
        data-testid="round-name-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {active?.createdAt && (
        <p className="info-message subtle">{new Date(active.createdAt).toLocaleString('pt-BR')}</p>
      )}
    </div>
  );

  if (rounds.length <= 1) {
    return (
      <div className="panel round-selector-panel" data-testid="round-panel">
        <h2>Rodada</h2>
        {active ? nameField : <p className="info-message">Carregando…</p>}
      </div>
    );
  }

  return (
    <div className="panel round-selector-panel" data-testid="round-panel">
      <h2>Rodada</h2>
      <div className="form-row">
        <label htmlFor="roundSelect">Rodada ativa (import legado):</label>
        <select
          id="roundSelect"
          data-testid="round-select"
          className="input-text"
          value={activeRoundId || ''}
          onChange={(e) => onSelectRound(e.target.value)}
        >
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({new Date(r.createdAt).toLocaleDateString('pt-BR')})
            </option>
          ))}
        </select>
      </div>
      {nameField}
    </div>
  );
}
