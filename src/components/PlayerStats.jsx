import React, { useState, useMemo } from 'react';

/**
 * PlayerStats — Módulo de estatísticas de jogadores.
 * Exibe uma tabela com todos os jogadores e seus gols e assistências,
 * com controles para incrementar/decrementar cada estatística.
 *
 * @param {object} props
 * @param {Array} props.players - Lista de todos os jogadores
 * @param {function} props.onRecordGoal - Callback para registrar gol (playerId)
 * @param {function} props.onRemoveGoal - Callback para remover gol (playerId)
 * @param {function} props.onRecordAssist - Callback para registrar assistência (playerId)
 * @param {function} props.onRemoveAssist - Callback para remover assistência (playerId)
 */
export default function PlayerStats({
  players,
  onRecordGoal,
  onRemoveGoal,
  onRecordAssist,
  onRemoveAssist,
  showWinDrawLoss = false,
}) {
  // Coluna e direção de ordenação
  const [sortBy, setSortBy] = useState('goals'); // 'name', 'goals', 'assists', 'total'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'
  const [filterText, setFilterText] = useState('');

  // Mapeia status para rótulos em português
  const statusLabel = {
    available: '🟢 Disponível',
    in_field: '🔵 Em campo',
    injured: '🔴 Lesionado',
    tired: '🟡 Cansado',
  };

  /**
   * Ordena e filtra a lista de jogadores conforme critérios selecionados.
   */
  const sortedPlayers = useMemo(() => {
    let filtered = players.filter((p) =>
      p.name.toLowerCase().includes(filterText.toLowerCase())
    );

    filtered.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return sortDir === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        case 'goals':
          valA = a.goals || 0;
          valB = b.goals || 0;
          break;
        case 'assists':
          valA = a.assists || 0;
          valB = b.assists || 0;
          break;
        case 'total':
          valA = (a.goals || 0) + (a.assists || 0);
          valB = (b.goals || 0) + (b.assists || 0);
          break;
        case 'wins':
          valA = a.wins || 0;
          valB = b.wins || 0;
          break;
        case 'draws':
          valA = a.draws || 0;
          valB = b.draws || 0;
          break;
        case 'losses':
          valA = a.losses || 0;
          valB = b.losses || 0;
          break;
        default:
          valA = a.goals || 0;
          valB = b.goals || 0;
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    return filtered;
  }, [players, sortBy, sortDir, filterText]);

  /**
   * Alterna a direção de ordenação ao clicar na mesma coluna,
   * ou muda para a nova coluna em ordem descendente.
   */
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
  };

  // Ícone de ordenação para as colunas
  const sortIcon = (column) => {
    if (sortBy !== column) return '↕️';
    return sortDir === 'asc' ? '⬆️' : '⬇️';
  };

  // Calcula totais gerais para o rodapé da tabela
  const totalGoals = players.reduce((sum, p) => sum + (p.goals || 0), 0);
  const totalAssists = players.reduce((sum, p) => sum + (p.assists || 0), 0);

  return (
    <div className="stats-container">
      <div className="panel stats-panel">
        <h2>📊 Estatísticas de Jogadores</h2>

        {/* Barra de busca */}
        <div className="stats-filter">
          <input
            type="text"
            className="input-text"
            placeholder="🔍 Filtrar por nome..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>

        {/* Resumo geral */}
        <div className="stats-summary">
          <div className="stats-summary-item">
            <span className="stats-summary-value">{players.length}</span>
            <span className="stats-summary-label">Jogadores</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-value">{totalGoals}</span>
            <span className="stats-summary-label">⚽ Gols</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-value">{totalAssists}</span>
            <span className="stats-summary-label">👟 Assistências</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-value">{totalGoals + totalAssists}</span>
            <span className="stats-summary-label">🏅 Total</span>
          </div>
        </div>

        {sortedPlayers.length === 0 ? (
          <p className="empty-message">
            {filterText
              ? 'Nenhum jogador encontrado com esse nome.'
              : 'Nenhum jogador cadastrado. Adicione jogadores para ver as estatísticas!'}
          </p>
        ) : (
          <div className="stats-table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th className="stats-th-rank">#</th>
                  <th
                    className="stats-th-name sortable"
                    onClick={() => handleSort('name')}
                  >
                    Jogador {sortIcon('name')}
                  </th>
                  <th className="stats-th-status">Status</th>
                  {showWinDrawLoss && (
                    <>
                      <th
                        className="stats-th-stat sortable"
                        onClick={() => handleSort('wins')}
                      >
                        ✅ V {sortIcon('wins')}
                      </th>
                      <th
                        className="stats-th-stat sortable"
                        onClick={() => handleSort('draws')}
                      >
                        🤝 E {sortIcon('draws')}
                      </th>
                      <th
                        className="stats-th-stat sortable"
                        onClick={() => handleSort('losses')}
                      >
                        ❌ D {sortIcon('losses')}
                      </th>
                    </>
                  )}
                  <th
                    className="stats-th-stat sortable"
                    onClick={() => handleSort('goals')}
                  >
                    ⚽ Gols {sortIcon('goals')}
                  </th>
                  <th
                    className="stats-th-stat sortable"
                    onClick={() => handleSort('assists')}
                  >
                    👟 Assist. {sortIcon('assists')}
                  </th>
                  <th
                    className="stats-th-stat sortable"
                    onClick={() => handleSort('total')}
                  >
                    🏅 Total {sortIcon('total')}
                  </th>
                  <th className="stats-th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player, index) => (
                  <tr key={player.id} className={`stats-row status-row-${player.status}`}>
                    <td className="stats-rank">{index + 1}</td>
                    <td className="stats-name">{player.name}</td>
                    <td className="stats-status">{statusLabel[player.status]}</td>
                    {showWinDrawLoss && (
                      <>
                        <td className="stats-value">{player.wins || 0}</td>
                        <td className="stats-value">{player.draws || 0}</td>
                        <td className="stats-value">{player.losses || 0}</td>
                      </>
                    )}
                    <td className="stats-value">{player.goals || 0}</td>
                    <td className="stats-value">{player.assists || 0}</td>
                    <td className="stats-value stats-total">
                      {(player.goals || 0) + (player.assists || 0)}
                    </td>
                    <td className="stats-actions">
                      <div className="stats-action-group">
                        <button
                          className="btn btn-sm btn-stat-minus"
                          onClick={() => onRemoveGoal(player.id)}
                          title="Remover gol"
                          aria-label="Remover gol"
                          disabled={(player.goals || 0) === 0}
                        >
                          -
                        </button>
                        <span className="stats-action-label">⚽</span>
                        <button
                          className="btn btn-sm btn-stat-plus"
                          onClick={() => onRecordGoal(player.id)}
                          title="Registrar gol"
                          aria-label="Registrar gol"
                        >
                          +
                        </button>
                      </div>
                      <div className="stats-action-group">
                        <button
                          className="btn btn-sm btn-stat-minus"
                          onClick={() => onRemoveAssist(player.id)}
                          title="Remover assistência"
                          aria-label="Remover assistência"
                          disabled={(player.assists || 0) === 0}
                        >
                          -
                        </button>
                        <span className="stats-action-label">👟</span>
                        <button
                          className="btn btn-sm btn-stat-plus"
                          onClick={() => onRecordAssist(player.id)}
                          title="Registrar assistência"
                          aria-label="Registrar assistência"
                        >
                          +
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

