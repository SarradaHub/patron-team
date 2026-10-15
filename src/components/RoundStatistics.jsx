import React, { useState, useMemo } from 'react';

const COLUMNS = [
  { key: 'name', label: 'Jogador' },
  { key: 'goals', label: 'Gols' },
  { key: 'assists', label: 'Ass.' },
  { key: 'ownGoals', label: 'G.C.' },
  { key: 'matches', label: 'Partidas' },
  { key: 'goalkeeperMatches', label: 'GK' },
  { key: 'wins', label: 'V' },
  { key: 'draws', label: 'E' },
  { key: 'losses', label: 'D' },
];

/**
 * Estatísticas agregadas da rodada com ordenação por coluna.
 */
export default function RoundStatistics({ rows }) {
  const [sortBy, setSortBy] = useState('goals');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir(column === 'name' ? 'asc' : 'desc');
    }
  };

  const sortState = (column) => {
    if (sortBy !== column) return 'none';
    return sortDir === 'asc' ? 'asc' : 'desc';
  };

  const sortCue = (column) => {
    const word = sortState(column) === 'asc' ? 'menor' : sortState(column) === 'desc' ? 'maior' : '';
    return (
      <>
        <span className={`sort-mark sort-mark--${sortState(column)}`} aria-hidden="true" />
        {word ? <span className="visually-hidden"> {word}</span> : null}
      </>
    );
  };

  const applySort = (value) => {
    const [column, dir] = value.split(':');
    setSortBy(column);
    setSortDir(dir);
  };

  const sorted = useMemo(() => {
    const list = [...(rows || [])];
    list.sort((a, b) => {
      let va;
      let vb;
      if (sortBy === 'name') {
        va = (a.name || '').toLowerCase();
        vb = (b.name || '').toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      va = Number(a[sortBy]) || 0;
      vb = Number(b[sortBy]) || 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return list;
  }, [rows, sortBy, sortDir]);

  if (!rows || rows.length === 0) {
    return (
      <p className="empty-message">
        Nenhum jogador nos times desta rodada ainda. Forme times ou importe dados.
      </p>
    );
  }

  return (
    <div className="panel round-stats-panel">
      <h2>Estatísticas da rodada</h2>
      <p className="info-message">
        Gols e assistências vêm das <strong>stats por partida</strong> (partidas finalizadas).{' '}
        <strong>GK</strong> conta partidas em que o jogador foi goleiro externo.
      </p>
      <label className="stats-sort">
        Ordenar por
        <select
          aria-label="Ordenar por"
          value={`${sortBy}:${sortDir}`}
          onChange={(e) => applySort(e.target.value)}
        >
          {COLUMNS.map((col) =>
            col.key === 'name' ? (
              <React.Fragment key={col.key}>
                <option value={`${col.key}:asc`}>{col.label} (A–Z)</option>
                <option value={`${col.key}:desc`}>{col.label} (Z–A)</option>
              </React.Fragment>
            ) : (
              <React.Fragment key={col.key}>
                <option value={`${col.key}:desc`}>{col.label} (maior primeiro)</option>
                <option value={`${col.key}:asc`}>{col.label} (menor primeiro)</option>
              </React.Fragment>
            )
          )}
        </select>
      </label>
      <table className="stats-table stats-table-cards">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={col.key === 'name' ? 'sortable' : 'sortable stats-th-stat'}
                onClick={() => handleSort(col.key)}
              >
                {col.label} {sortCue(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.playerId}>
              <td className="stats-name">{row.name}</td>
              <td data-label="Gols">{row.goals}</td>
              <td data-label="Ass.">{row.assists}</td>
              <td data-label="G.C.">{row.ownGoals}</td>
              <td data-label="Partidas">{row.matches}</td>
              <td data-label="GK">{row.goalkeeperMatches ?? 0}</td>
              <td data-label="V">{row.wins}</td>
              <td data-label="E">{row.draws}</td>
              <td data-label="D">{row.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
