import React, { useState, useEffect, useMemo } from 'react';
import {
  listPlayerStatsForMatch,
  bulkUpsertPlayerStats,
} from '../api/indexeddb.js';
import {
  eligibleExternalGoalkeeperIds,
  getFieldRosterIds,
} from '../domain/goalkeeperEligibility.js';
import { labelMatchSide } from '../domain/teamLabels.js';

function StatStepper({ label, value, onDecrement, onIncrement }) {
  return (
    <div className="stats-action-group match-stats-stepper">
      <button
        type="button"
        className="btn btn-sm btn-stat-minus"
        aria-label={`Diminuir ${label}`}
        title={`Diminuir ${label}`}
        onClick={onDecrement}
        disabled={(Number(value) || 0) <= 0}
      >
        -
      </button>
      <span className="stats-value match-stats-stepper-value">{Number(value) || 0}</span>
      <button
        type="button"
        className="btn btn-sm btn-stat-plus"
        aria-label={`Aumentar ${label}`}
        title={`Aumentar ${label}`}
        onClick={onIncrement}
      >
        +
      </button>
    </div>
  );
}

function TeamStatsBlock({ title, team, rows, nameById, onAdjustRow }) {
  if (!team) return null;
  return (
    <div className="match-stats-team-block panel stats-panel">
      <h4 className="match-stats-team-title">{title}</h4>
      <div className="stats-table-wrapper">
        <table className="stats-table match-stats-mini-table">
          <thead>
            <tr>
              <th>Jogador</th>
              <th>Gols</th>
              <th>Ass.</th>
              <th>G.C.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId}>
                <td className="stats-name">{nameById[r.playerId] || r.playerId.slice(0, 8)}</td>
                <td>
                  <StatStepper
                    label="gols"
                    value={r.goals}
                    onDecrement={() => onAdjustRow(r.playerId, 'goals', -1)}
                    onIncrement={() => onAdjustRow(r.playerId, 'goals', 1)}
                  />
                </td>
                <td>
                  <StatStepper
                    label="assistências"
                    value={r.assists}
                    onDecrement={() => onAdjustRow(r.playerId, 'assists', -1)}
                    onIncrement={() => onAdjustRow(r.playerId, 'assists', 1)}
                  />
                </td>
                <td>
                  <StatStepper
                    label="gols contra"
                    value={r.ownGoals}
                    onDecrement={() => onAdjustRow(r.playerId, 'ownGoals', -1)}
                    onIncrement={() => onAdjustRow(r.playerId, 'ownGoals', 1)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GoalkeeperBlock({
  label,
  value,
  optionIds,
  nameById,
  stats,
  onChangePlayer,
  onAdjustStat,
}) {
  return (
    <div className="match-gk-select panel stats-panel">
      <label className="match-gk-label">{label}</label>
      <select
        className="match-gk-input"
        value={value}
        onChange={(e) => onChangePlayer(e.target.value)}
      >
        <option value="">Nenhum</option>
        {optionIds.map((id) => (
          <option key={id} value={id}>
            {nameById[id] || id.slice(0, 8)}
          </option>
        ))}
      </select>
      {value ? (
        <div className="match-gk-stats-grid">
          <div className="match-gk-stat">
            <span className="match-gk-stat-label">Gols</span>
            <StatStepper
              label="gols do goleiro"
              value={stats.goals}
              onDecrement={() => onAdjustStat('goals', -1)}
              onIncrement={() => onAdjustStat('goals', 1)}
            />
          </div>
          <div className="match-gk-stat">
            <span className="match-gk-stat-label">Ass.</span>
            <StatStepper
              label="assistências do goleiro"
              value={stats.assists}
              onDecrement={() => onAdjustStat('assists', -1)}
              onIncrement={() => onAdjustStat('assists', 1)}
            />
          </div>
          <div className="match-gk-stat">
            <span className="match-gk-stat-label">G.C.</span>
            <StatStepper
              label="gols contra do goleiro"
              value={stats.ownGoals}
              onDecrement={() => onAdjustStat('ownGoals', -1)}
              onIncrement={() => onAdjustStat('ownGoals', 1)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Modal A | B para stats por partida (agendada ou finalizada).
 */
export default function MatchStatsModal({
  match,
  teams,
  allPlayers,
  roundId,
  onClose,
  onSaved,
  onFinalizeFromStats,
  onRequestDrawFromStats,
}) {
  const nameById = useMemo(
    () => Object.fromEntries((allPlayers || []).map((p) => [p.id, p.name])),
    [allPlayers]
  );
  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const teamA = teamMap[match.teamA];
  const teamB = teamMap[match.teamB];

  const [rowsA, setRowsA] = useState([]);
  const [rowsB, setRowsB] = useState([]);
  const [gkTeamA, setGkTeamA] = useState('');
  const [gkTeamB, setGkTeamB] = useState('');
  const [gkStatsA, setGkStatsA] = useState({ goals: 0, assists: 0, ownGoals: 0 });
  const [gkStatsB, setGkStatsB] = useState({ goals: 0, assists: 0, ownGoals: 0 });

  const idsField = useMemo(() => getFieldRosterIds(match, teamA, teamB), [match, teamA, teamB]);

  const eligA = useMemo(
    () =>
      eligibleExternalGoalkeeperIds(
        match,
        teams,
        allPlayers || [],
        match.teamA,
        idsField.idsA,
        idsField.idsB
      ).sort((a, b) => (nameById[a] || '').localeCompare(nameById[b] || '', 'pt-BR')),
    [match, teams, allPlayers, nameById, idsField]
  );

  const eligB = useMemo(
    () =>
      eligibleExternalGoalkeeperIds(
        match,
        teams,
        allPlayers || [],
        match.teamB,
        idsField.idsA,
        idsField.idsB
      ).sort((a, b) => (nameById[a] || '').localeCompare(nameById[b] || '', 'pt-BR')),
    [match, teams, allPlayers, nameById, idsField]
  );

  const optionsGkA = useMemo(() => {
    const s = new Set(eligA);
    if (gkTeamA) s.add(gkTeamA);
    return [...s].sort((a, b) => (nameById[a] || '').localeCompare(nameById[b] || '', 'pt-BR'));
  }, [eligA, gkTeamA, nameById]);

  const optionsGkB = useMemo(() => {
    const s = new Set(eligB);
    if (gkTeamB) s.add(gkTeamB);
    return [...s].sort((a, b) => (nameById[a] || '').localeCompare(nameById[b] || '', 'pt-BR'));
  }, [eligB, gkTeamB, nameById]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await listPlayerStatsForMatch(match.id);
      const fieldByPid = Object.fromEntries(
        existing.filter((s) => !s.wasGoalkeeper).map((s) => [s.playerId, s])
      );

      const liveA = teamMap[match.teamA];
      const liveB = teamMap[match.teamB];
      let idsA = liveA?.players?.length ? [...liveA.players] : [...(match.rosterA || [])];
      let idsB = liveB?.players?.length ? [...liveB.players] : [...(match.rosterB || [])];

      if (!idsA.length) {
        idsA = [
          ...new Set(
            existing
              .filter((s) => s.teamId === match.teamA && !s.wasGoalkeeper)
              .map((s) => s.playerId)
          ),
        ];
      }
      if (!idsB.length) {
        idsB = [
          ...new Set(
            existing
              .filter((s) => s.teamId === match.teamB && !s.wasGoalkeeper)
              .map((s) => s.playerId)
          ),
        ];
      }

      const buildRows = (playerIds, teamId) =>
        playerIds.map((playerId) => {
          const ex = fieldByPid[playerId];
          return {
            playerId,
            teamId,
            goals: ex?.goals ?? 0,
            assists: ex?.assists ?? 0,
            ownGoals: ex?.ownGoals ?? 0,
          };
        });

      const gkA = existing.find((s) => s.teamId === match.teamA && s.wasGoalkeeper);
      const gkB = existing.find((s) => s.teamId === match.teamB && s.wasGoalkeeper);

      if (!cancelled) {
        setRowsA(buildRows(idsA, match.teamA));
        setRowsB(buildRows(idsB, match.teamB));
        setGkTeamA(gkA ? gkA.playerId : '');
        setGkTeamB(gkB ? gkB.playerId : '');
        setGkStatsA({
          goals: gkA?.goals ?? 0,
          assists: gkA?.assists ?? 0,
          ownGoals: gkA?.ownGoals ?? 0,
        });
        setGkStatsB({
          goals: gkB?.goals ?? 0,
          assists: gkB?.assists ?? 0,
          ownGoals: gkB?.ownGoals ?? 0,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [match.id, match.teamA, match.teamB, match.rosterA, match.rosterB, teamMap]);

  const updateRow = (setter, playerId, field, delta) => {
    setter((prev) =>
      prev.map((r) =>
        r.playerId === playerId
          ? { ...r, [field]: Math.max(0, (Number(r[field]) || 0) + delta) }
          : r
      )
    );
  };

  const buildCombinedPayload = () => {
    const combined = [
      ...rowsA.map((r) => ({
        playerId: r.playerId,
        teamId: match.teamA,
        goals: r.goals,
        assists: r.assists,
        ownGoals: r.ownGoals,
        wasGoalkeeper: false,
      })),
      ...rowsB.map((r) => ({
        playerId: r.playerId,
        teamId: match.teamB,
        goals: r.goals,
        assists: r.assists,
        ownGoals: r.ownGoals,
        wasGoalkeeper: false,
      })),
    ];
    if (gkTeamA) {
      combined.push({
        playerId: gkTeamA,
        teamId: match.teamA,
        goals: Number(gkStatsA.goals) || 0,
        assists: Number(gkStatsA.assists) || 0,
        ownGoals: Number(gkStatsA.ownGoals) || 0,
        wasGoalkeeper: true,
      });
    }
    if (gkTeamB) {
      combined.push({
        playerId: gkTeamB,
        teamId: match.teamB,
        goals: Number(gkStatsB.goals) || 0,
        assists: Number(gkStatsB.assists) || 0,
        ownGoals: Number(gkStatsB.ownGoals) || 0,
        wasGoalkeeper: true,
      });
    }
    return combined;
  };

  const saveStatsToDb = async () => {
    const combined = buildCombinedPayload();
    await bulkUpsertPlayerStats(match.id, roundId, combined);
  };

  const handleSave = async () => {
    try {
      await saveStatsToDb();
      onSaved?.();
      onClose();
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  const handleSaveAndSetResult = async (result) => {
    if (match.status !== 'scheduled' || !onFinalizeFromStats || !onRequestDrawFromStats) return;
    try {
      await saveStatsToDb();
    } catch (err) {
      alert(err.message || String(err));
      return;
    }
    try {
      if (result === 'draw') {
        await onRequestDrawFromStats();
        onSaved?.();
      } else {
        await onFinalizeFromStats(result);
      }
      onClose();
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  const sumGoals = (rows) => rows.reduce((acc, r) => acc + (Number(r.goals) || 0), 0);
  const sumOwn = (rows) => rows.reduce((acc, r) => acc + (Number(r.ownGoals) || 0), 0);
  const gkGoalsA = gkTeamA ? Number(gkStatsA.goals) || 0 : 0;
  const gkOwnA = gkTeamA ? Number(gkStatsA.ownGoals) || 0 : 0;
  const gkGoalsB = gkTeamB ? Number(gkStatsB.goals) || 0 : 0;
  const gkOwnB = gkTeamB ? Number(gkStatsB.ownGoals) || 0 : 0;
  const goalsA = sumGoals(rowsA) + sumOwn(rowsB) + gkGoalsA + gkOwnB;
  const goalsB = sumGoals(rowsB) + sumOwn(rowsA) + gkGoalsB + gkOwnA;

  const sideTitleA = labelMatchSide(match.teamA, 'A', teamMap);
  const sideTitleB = labelMatchSide(match.teamB, 'B', teamMap);

  const canSave = rowsA.length > 0 || rowsB.length > 0 || gkTeamA || gkTeamB;
  const isScheduled = match.status === 'scheduled';
  const showResultActions = isScheduled && onFinalizeFromStats && onRequestDrawFromStats;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-content match-stats-modal match-stats-modal-wide">
        <h3>Stats da partida</h3>
        <p className="modal-sub">
          Padrão do placar: <strong>Time A</strong> à esquerda, <strong>Time B</strong> à direita. Salve a
          qualquer momento.
        </p>
        <div className="stats-summary match-stats-score-summary">
          <div className="stats-summary-item match-stats-score-summary--a">
            <span className="stats-summary-value">{goalsA}</span>
            <span className="stats-summary-label">
              <span className="stats-summary-main">Gols Time A (esq.)</span>
            </span>
          </div>
          <div className="stats-summary-item match-stats-score-summary--b">
            <span className="stats-summary-value">{goalsB}</span>
            <span className="stats-summary-label">
              <span className="stats-summary-main">Gols Time B (dir.)</span>
            </span>
          </div>
        </div>
        {!rowsA.length && !rowsB.length ? (
          <p className="modal-sub warning-text">
            Elenco desta partida não está disponível (times dissolvidos e sem stats salvas). Partidas
            finalizadas após esta atualização guardam o elenco automaticamente.
          </p>
        ) : null}
        <div className="match-stats-split">
          <div className="match-stats-side match-stats-side--team-a">
            <TeamStatsBlock
              title={sideTitleA}
              team={teamA || { id: match.teamA, players: rowsA.map((r) => r.playerId) }}
              rows={rowsA}
              nameById={nameById}
              onAdjustRow={(pid, f, delta) => updateRow(setRowsA, pid, f, delta)}
            />
            <GoalkeeperBlock
              label="Goleiro (fora do elenco)"
              value={gkTeamA}
              optionIds={optionsGkA}
              nameById={nameById}
              stats={gkStatsA}
              onChangePlayer={async (id) => {
                setGkTeamA(id);
                if (!id) {
                  setGkStatsA({ goals: 0, assists: 0, ownGoals: 0 });
                  return;
                }
                const existing = await listPlayerStatsForMatch(match.id);
                const line = existing.find(
                  (s) =>
                    s.teamId === match.teamA && s.wasGoalkeeper && s.playerId === id
                );
                setGkStatsA({
                  goals: line?.goals ?? 0,
                  assists: line?.assists ?? 0,
                  ownGoals: line?.ownGoals ?? 0,
                });
              }}
              onAdjustStat={(field, delta) =>
                setGkStatsA((prev) => ({
                  ...prev,
                  [field]: Math.max(0, (Number(prev[field]) || 0) + delta),
                }))
              }
            />
          </div>
          <div className="match-stats-side match-stats-side--team-b">
            <TeamStatsBlock
              title={sideTitleB}
              team={teamB || { id: match.teamB, players: rowsB.map((r) => r.playerId) }}
              rows={rowsB}
              nameById={nameById}
              onAdjustRow={(pid, f, delta) => updateRow(setRowsB, pid, f, delta)}
            />
            <GoalkeeperBlock
              label="Goleiro (fora do elenco)"
              value={gkTeamB}
              optionIds={optionsGkB}
              nameById={nameById}
              stats={gkStatsB}
              onChangePlayer={async (id) => {
                setGkTeamB(id);
                if (!id) {
                  setGkStatsB({ goals: 0, assists: 0, ownGoals: 0 });
                  return;
                }
                const existing = await listPlayerStatsForMatch(match.id);
                const line = existing.find(
                  (s) =>
                    s.teamId === match.teamB && s.wasGoalkeeper && s.playerId === id
                );
                setGkStatsB({
                  goals: line?.goals ?? 0,
                  assists: line?.assists ?? 0,
                  ownGoals: line?.ownGoals ?? 0,
                });
              }}
              onAdjustStat={(field, delta) =>
                setGkStatsB((prev) => ({
                  ...prev,
                  [field]: Math.max(0, (Number(prev[field]) || 0) + delta),
                }))
              }
            />
          </div>
        </div>
        {showResultActions ? (
          <div className="match-stats-result-panel">
            <h4 className="match-stats-result-title">Resultado (finaliza a partida)</h4>
            <p className="modal-sub subtle">
              Salva as stats acima e aplica o resultado. Empate pode abrir desempate se só houver um time na fila.
            </p>
            <div className="match-stats-result-actions">
              <button
                type="button"
                className="btn btn-match btn-a-win btn-sm"
                disabled={!canSave}
                onClick={() => handleSaveAndSetResult('A_win')}
              >
                Time A venceu
              </button>
              <button
                type="button"
                className="btn btn-match btn-draw btn-sm"
                disabled={!canSave}
                onClick={() => handleSaveAndSetResult('draw')}
              >
                Empate
              </button>
              <button
                type="button"
                className="btn btn-match btn-b-win btn-sm"
                disabled={!canSave}
                onClick={() => handleSaveAndSetResult('B_win')}
              >
                Time B venceu
              </button>
            </div>
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            Salvar stats
          </button>
        </div>
      </div>
    </div>
  );
}
