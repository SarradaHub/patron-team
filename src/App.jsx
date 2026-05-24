import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  addPlayer,
  getPlayers,
  getTeams,
  getMatches,
  formAllTeamsPossible,
  removePlayer,
  restorePlayerToAvailable,
  recordGoal,
  removeGoal,
  recordAssist,
  removeAssist,
  scheduleMatch,
  finalizeMatch,
  updatePlayerProfile,
  updateTeamDisplayName,
  updateTeamRoster,
  updateScheduledMatchTeams,
  cancelScheduledMatch,
  deleteMatch,
  deletePlayerPermanently,
  deleteTeam,
  exportData,
  importData,
  onChange,
  ensureDefaultActiveRound,
  getActiveRoundId,
  setActiveRoundId,
  getRounds,
  suggestNextMatchForRound,
  getRoundStatistics,
  getGlobalPlayerStatistics,
  getMatchScoresForRound,
  listPreWaitingTeamIds,
  runDatastoreMaintenance,
  setScheduledMatchTimerDuration,
  startScheduledMatchCountdown,
  clearScheduledMatchCountdown,
} from './api/indexeddb.js';
import { exportToSupabase } from './api/cloudExport.js';
import { clearLocalAppCache } from './api/localDataClear.js';
import { sortWaitingTeamsForRound } from './domain/waitingQueueOrder.js';
import { buildTeamLabelById, labelMatchSide } from './domain/teamLabels.js';
import QueueList from './components/QueueList.jsx';
import WaitingTeamsList from './components/WaitingTeamsList.jsx';
import GoalkeeperQueuePanel from './components/GoalkeeperQueuePanel.jsx';
import TeamCard from './components/TeamCard.jsx';
import MatchHistory from './components/MatchHistory.jsx';
import Controls from './components/Controls.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import RoundSelector from './components/RoundSelector.jsx';
import RoundStatistics from './components/RoundStatistics.jsx';
import PlayerStats from './components/PlayerStats.jsx';
import MatchStatsModal from './components/MatchStatsModal.jsx';
import DrawTiebreakerModal from './components/DrawTiebreakerModal.jsx';
import EditPlayerModal from './components/EditPlayerModal.jsx';
import EditTeamModal from './components/EditTeamModal.jsx';
import EditScheduledMatchModal from './components/EditScheduledMatchModal.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import MatchCountdownBanner from './components/MatchCountdownBanner.jsx';
import { isAuthenticated, clearSession } from './auth/auth.js';
import './styles.css';

const TOAST_OPTIONS = {
  className: 'app-toast',
  duration: 4000,
  style: {
    background: 'var(--cor-painel)',
    color: 'var(--cor-texto)',
    border: '1px solid var(--cor-borda)',
  },
};

export default function App() {
  const [autenticado, setAutenticado] = useState(isAuthenticated());
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [activeRoundId, setActiveRoundIdState] = useState(null);
  const [roundStatsRows, setRoundStatsRows] = useState([]);
  const [globalStatsRows, setGlobalStatsRows] = useState([]);
  const [matchScores, setMatchScores] = useState({});
  const [suggestion, setSuggestion] = useState(null);
  const [statsModalMatch, setStatsModalMatch] = useState(null);
  const [activeTab, setActiveTab] = useState('queue');
  const [teamSize, setTeamSize] = useState(5);
  const [drawTiebreakerMatch, setDrawTiebreakerMatch] = useState(null);
  const [editPlayer, setEditPlayer] = useState(null);
  const [editTeam, setEditTeam] = useState(null);
  const [editTeamDefaultLabel, setEditTeamDefaultLabel] = useState('');
  const [editMatch, setEditMatch] = useState(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [timerTargetMatchId, setTimerTargetMatchId] = useState(null);
  const timerExpiredRef = useRef(new Set());

  const handleLogin = () => setAutenticado(true);

  const handleLogout = () => {
    clearSession();
    setAutenticado(false);
  };

  useEffect(() => {
    if (!autenticado) return undefined;
    const id = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [autenticado]);

  useEffect(() => {
    if (!autenticado) return;
    if (!activeRoundId) {
      setTimerTargetMatchId(null);
      return;
    }
    const scheduled = matches.filter(
      (m) => m.status === 'scheduled' && m.roundId === activeRoundId
    );
    setTimerTargetMatchId((prev) => {
      if (prev && scheduled.some((m) => m.id === prev)) return prev;
      if (scheduled.length === 1) return scheduled[0].id;
      try {
        const stored = localStorage.getItem(`arjen-timer-match-${activeRoundId}`);
        if (stored && scheduled.some((m) => m.id === stored)) return stored;
      } catch {
        /* ignore */
      }
      return null;
    });
  }, [autenticado, activeRoundId, matches]);

  useEffect(() => {
    if (!autenticado) return;
    for (const m of matches) {
      if (m.status !== 'scheduled' || !m.countdownEndsAt) {
        timerExpiredRef.current.delete(m.id);
        continue;
      }
      const rem = new Date(m.countdownEndsAt).getTime() - clockNow;
      if (rem <= 0 && !timerExpiredRef.current.has(m.id)) {
        timerExpiredRef.current.add(m.id);
        toast('Tempo esgotado.', { icon: '⏱️' });
      }
    }
  }, [autenticado, matches, clockNow]);

  if (!autenticado) {
    return (
      <>
        <Toaster position="top-right" toastOptions={TOAST_OPTIONS} />
        <ThemeToggle className="login-theme-toggle" />
        <LoginScreen onLogin={handleLogin} />
      </>
    );
  }

  const refreshData = useCallback(async () => {
    try {
      await ensureDefaultActiveRound();
      const aid = await getActiveRoundId();
      setActiveRoundIdState(aid);
      const [p, t, m, r, stats, globalStats, scores] = await Promise.all([
        getPlayers(),
        aid ? getTeams(aid) : getTeams(),
        aid ? getMatches(aid) : getMatches(),
        getRounds(),
        aid ? getRoundStatistics(aid) : Promise.resolve([]),
        getGlobalPlayerStatistics(),
        aid ? getMatchScoresForRound(aid) : Promise.resolve({}),
      ]);
      setPlayers(p);
      setTeams(t);
      setMatches(m);
      setRounds(r);
      setRoundStatsRows(stats);
      setGlobalStatsRows(globalStats);
      setMatchScores(scores);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      toast.error('Erro ao carregar dados do banco.');
    }
  }, []);

  useEffect(() => {
    refreshData();
    const unsubscribe = onChange(() => {
      refreshData();
    });
    return unsubscribe;
  }, [refreshData]);

  const handleSelectRound = async (roundId) => {
    try {
      await setActiveRoundId(roundId);
      setSuggestion(null);
      await refreshData();
      toast.success('Rodada ativa alterada.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddPlayer = async (name, options = {}) => {
    try {
      await addPlayer(name, options);
      toast.success(
        options.goalkeeperOnly
          ? `Goleiro "${name}" adicionado (só lista de goleiros).`
          : `Jogador "${name}" adicionado à fila!`
      );
      await refreshData();
    } catch (err) {
      toast.error(`Erro: ${err.message}`);
    }
  };

  const handleFormTeam = async (size) => {
    if (!activeRoundId) return;
    try {
      const teams = await formAllTeamsPossible(size, activeRoundId);
      const n = teams[0]?.players?.length ?? size;
      if (teams.length === 1) {
        toast.success(`Time de ${n} jogadores formado!`);
      } else {
        toast.success(`${teams.length} times formados (${n} jogadores cada)!`);
      }
      await refreshData();
    } catch (err) {
      toast.error(`Erro: ${err.message}`);
    }
  };

  const handleSuggestNext = async () => {
    if (!activeRoundId) return;
    try {
      const s = await suggestNextMatchForRound(activeRoundId, teamSize);
      setSuggestion(s);
      if (s.ok) toast.success('Sugestão calculada.');
      else toast.error(s.error);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleScheduleSuggested = async () => {
    if (!activeRoundId || !suggestion?.ok) return;
    try {
      await scheduleMatch(activeRoundId, suggestion.teamAId, suggestion.teamBId, { teamSize });
      toast.success('Partida agendada. Edite stats e finalize no histórico.');
      setSuggestion(null);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleFinalizeScheduled = async (matchId, result, tiebreakerWinnerTeamId = null) => {
    try {
      await finalizeMatch(matchId, result, { teamSize, tiebreakerWinnerTeamId });
      toast.success('Partida finalizada.');
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRequestDraw = async (match) => {
    if (!activeRoundId) return;
    try {
      const pre = await listPreWaitingTeamIds(activeRoundId, teamSize);
      if (pre.length === 1) {
        setDrawTiebreakerMatch(match);
        return;
      }
      await handleFinalizeScheduled(match.id, 'draw');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleTiebreakerPick = async (winnerTeamId) => {
    if (!drawTiebreakerMatch) return;
    try {
      await finalizeMatch(drawTiebreakerMatch.id, 'draw', {
        teamSize,
        tiebreakerWinnerTeamId: winnerTeamId,
      });
      toast.success('Partida finalizada.');
      setDrawTiebreakerMatch(null);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRemovePlayer = async (playerId, reason, substitute) => {
    try {
      const { substituted } = await removePlayer(
        playerId,
        reason,
        substitute,
        activeRoundId,
        teamSize
      );
      const msg = substituted
        ? `${reason === 'injured' ? 'Lesão' : 'Cansado'} registrado — substituto entrou a partir do próximo time na fila.`
        : `Jogador marcado como ${reason === 'injured' ? 'lesionado' : 'cansado'}.`;
      toast.success(msg);
      await refreshData();
    } catch (err) {
      toast.error(`Erro: ${err.message}`);
    }
  };

  const handleRestorePlayer = async (playerId) => {
    try {
      await restorePlayerToAvailable(playerId);
      toast.success('Jogador liberado e colocado no fim da fila.');
      await refreshData();
    } catch (err) {
      toast.error(`Erro: ${err.message}`);
    }
  };

  const handleSavePlayerName = async (playerId, payload) => {
    try {
      await updatePlayerProfile(playerId, payload);
      toast.success('Jogador atualizado.');
      setEditPlayer(null);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRecordGoal = async (playerId) => {
    try {
      await recordGoal(playerId);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRemoveGoal = async (playerId) => {
    try {
      await removeGoal(playerId);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRecordAssist = async (playerId) => {
    try {
      await recordAssist(playerId);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRemoveAssist = async (playerId) => {
    try {
      await removeAssist(playerId);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRunMaintenance = async () => {
    try {
      const summary = await runDatastoreMaintenance();
      const ghost = summary.requeuedGhostInField ?? 0;
      toast.success(
        `GC finalizado: ${summary.removedStats} stats removidas, ${summary.scrubbedTeamPlayerSlots} vínculos limpos${ghost ? `, ${ghost} jog. in_field recolocados` : ''}.`
      );
      await refreshData();
    } catch (err) {
      toast.error(`Falha na manutenção: ${err.message}`);
    }
  };

  const handleSaveTeam = async (teamId, { displayName, playerIds }) => {
    try {
      await updateTeamDisplayName(teamId, displayName);
      const orig =
        teams.find((x) => x.id === teamId)?.players ?? editTeam?.players ?? [];
      const rosterChanged = JSON.stringify(playerIds) !== JSON.stringify(orig);
      if (rosterChanged) {
        if (!activeRoundId) {
          toast.error('Selecione uma rodada.');
          return;
        }
        await updateTeamRoster(teamId, playerIds, activeRoundId, { teamSize });
      }
      toast.success('Time atualizado.');
      setEditTeam(null);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSaveScheduledTeams = async (matchId, teamAId, teamBId) => {
    try {
      await updateScheduledMatchTeams(matchId, teamAId, teamBId, { teamSize });
      toast.success('Times da partida atualizados.');
      setEditMatch(null);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCancelScheduledMatch = async (matchId) => {
    try {
      await cancelScheduledMatch(matchId);
      toast.success('Partida cancelada.');
      setEditMatch(null);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeletePlayerPermanent = async (playerId) => {
    if (
      !window.confirm(
        'Excluir este jogador para sempre? Remove de times, stats por partida e não dá para desfazer.'
      )
    ) {
      return;
    }
    try {
      await deletePlayerPermanently(playerId);
      toast.success('Jogador excluído.');
      setEditPlayer(null);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleGoalkeeperPanelDelete = async (player) => {
    if (player.goalkeeperOnly) {
      if (
        !window.confirm(
          'Excluir este goleiro (cadastro só goleiro)? Não dá para desfazer.'
        )
      ) {
        return;
      }
      try {
        await deletePlayerPermanently(player.id);
        toast.success('Goleiro excluído.');
        await refreshData();
      } catch (err) {
        toast.error(err.message);
      }
      return;
    }
    if (
      !window.confirm(
        'Remover da lista de goleiros? O jogador continua na fila de linha.'
      )
    ) {
      return;
    }
    try {
      await updatePlayerProfile(player.id, { preferGoalkeeper: false });
      toast.success('Removido da lista de goleiros.');
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteTeam = async (teamId) => {
    if (
      !window.confirm(
        'Excluir este time? Jogadores voltam só à fila (cadastro intacto). Não dá para desfazer.'
      )
    ) {
      return;
    }
    try {
      await deleteTeam(teamId);
      toast.success('Time excluído.');
      setEditTeam(null);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteMatch = async (matchId, status) => {
    const msg =
      status === 'scheduled'
        ? 'Excluir partida agendada e rascunho de stats?'
        : 'Excluir partida finalizada e todas as stats desta partida? Não dá para desfazer.';
    if (!window.confirm(msg)) return;
    try {
      await deleteMatch(matchId);
      toast.success('Partida excluída.');
      setStatsModalMatch((m) => (m?.id === matchId ? null : m));
      setEditMatch((m) => (m?.id === matchId ? null : m));
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSetMatchTimerDuration = async (matchId, minutes) => {
    try {
      await setScheduledMatchTimerDuration(matchId, minutes);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleStartMatchCountdown = async (matchId) => {
    try {
      await startScheduledMatchCountdown(matchId);
      toast.success('Cronômetro iniciado.');
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleClearMatchCountdown = async (matchId) => {
    try {
      await clearScheduledMatchCountdown(matchId);
      await refreshData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleTimerMatchPick = useCallback((matchId) => {
    setTimerTargetMatchId(matchId || null);
    if (activeRoundId && matchId) {
      try {
        localStorage.setItem(`arjen-timer-match-${activeRoundId}`, matchId);
      } catch {
        /* ignore */
      }
    }
  }, [activeRoundId]);

  const handleTimerPresetStart = useCallback(
    async (matchId, minutes) => {
      try {
        await setScheduledMatchTimerDuration(matchId, minutes);
        await startScheduledMatchCountdown(matchId);
        toast.success('Cronômetro iniciado.');
        await refreshData();
      } catch (err) {
        toast.error(err.message);
      }
    },
    [refreshData]
  );

  const handleExport = async () => {
    try {
      const data = await exportData();
      const result = await exportToSupabase(data);
      if (result?.duplicate) {
        toast.success('Exportação já registrada (idempotente).');
      } else {
        toast.success('Dados enviados para Supabase!');
      }
    } catch (err) {
      console.error('handleExport:', err);
      toast.error(`Erro ao exportar: ${err.message}`);
    }
  };

  const handleImport = async (json) => {
    try {
      await importData(json);
      toast.success('Dados importados com sucesso!');
      await refreshData();
    } catch (err) {
      toast.error(`Erro ao importar: ${err.message}`);
    }
  };

  const handleClearLocalCache = async () => {
    try {
      await clearLocalAppCache();
      setSuggestion(null);
      setStatsModalMatch(null);
      setTimerTargetMatchId(null);
      await refreshData();
      toast.success('Cache local limpo. Nova rodada criada.');
    } catch (err) {
      console.error('handleClearLocalCache:', err);
      toast.error(`Erro ao limpar cache: ${err.message}`);
    }
  };

  const teamsInField = teams.filter((t) => t.status === 'in_field');
  const globalStatsByPlayerId = useMemo(
    () => Object.fromEntries((globalStatsRows || []).map((row) => [row.playerId, row])),
    [globalStatsRows]
  );
  const playersForGlobalStats = useMemo(
    () =>
      players.map((player) => {
        const statRow = globalStatsByPlayerId[player.id] || {};
        return {
          ...player,
          wins: statRow.wins || 0,
          draws: statRow.draws || 0,
          losses: statRow.losses || 0,
        };
      }),
    [players, globalStatsByPlayerId]
  );
  const fifoWaitingTeams = useMemo(
    () =>
      activeRoundId
        ? sortWaitingTeamsForRound(teams, activeRoundId, players, teamSize)
        : [],
    [teams, activeRoundId, players, teamSize]
  );
  const waitingQueueIndexByTeamId = useMemo(
    () =>
      Object.fromEntries(fifoWaitingTeams.map((team, index) => [team.id, index + 1])),
    [fifoWaitingTeams]
  );
  const teamLabelById = useMemo(
    () => buildTeamLabelById(teamsInField, fifoWaitingTeams),
    [teamsInField, fifoWaitingTeams]
  );

  const teamById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

  const timerMatchOptions = useMemo(() => {
    if (!activeRoundId) return [];
    return matches
      .filter((m) => m.status === 'scheduled' && m.roundId === activeRoundId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map((m) => ({
        id: m.id,
        label: `${labelMatchSide(m.teamA, 'A', teamById)} × ${labelMatchSide(m.teamB, 'B', teamById)}`,
      }));
  }, [matches, activeRoundId, teamById]);

  const timerTargetMatch = useMemo(() => {
    if (!timerTargetMatchId) return null;
    return (
      matches.find((m) => m.id === timerTargetMatchId && m.status === 'scheduled') ?? null
    );
  }, [matches, timerTargetMatchId]);

  const playerFilaNumberById = useMemo(() => {
    const list = players.filter((p) => !p.goalkeeperOnly);
    return Object.fromEntries(list.map((p, i) => [p.id, i + 1]));
  }, [players]);

  const unavailableSummary = useMemo(() => {
    let injured = 0;
    let tired = 0;
    for (const p of players) {
      if (p.status === 'injured') injured += 1;
      else if (p.status === 'tired') tired += 1;
    }
    return { injured, tired, total: injured + tired };
  }, [players]);

  const linePlayersWithoutTeam = useMemo(() => {
    if (!activeRoundId) return 0;
    const onRoster = new Set();
    for (const t of teams) {
      if (t.roundId !== activeRoundId) continue;
      if (t.status !== 'in_field' && t.status !== 'waiting') continue;
      for (const pid of t.players || []) onRoster.add(pid);
    }
    let n = 0;
    for (const p of players) {
      if (p.goalkeeperOnly) continue;
      if (p.status === 'injured' || p.status === 'tired') continue;
      if (!onRoster.has(p.id)) n += 1;
    }
    return n;
  }, [activeRoundId, teams, players]);

  const runningCountdowns = matches.filter(
    (m) => m.status === 'scheduled' && m.countdownEndsAt
  );
  const bannerMatch =
    runningCountdowns.length === 0
      ? null
      : runningCountdowns.length === 1
        ? runningCountdowns[0]
        : runningCountdowns.find((m) => m.id === timerTargetMatchId) || runningCountdowns[0];
  const bannerSubtitle = bannerMatch
    ? `${labelMatchSide(bannerMatch.teamA, 'A', teamById)} × ${labelMatchSide(bannerMatch.teamB, 'B', teamById)}`
    : '';
  const bannerRemainingMs = bannerMatch?.countdownEndsAt
    ? new Date(bannerMatch.countdownEndsAt).getTime() - clockNow
    : 0;

  return (
    <div className="app-container">
      <Toaster position="top-right" toastOptions={TOAST_OPTIONS} />

      <div className="app-top-bar">
        <ThemeToggle />
        <button className="btn btn-outline btn-sm" onClick={handleLogout} title="Sair" type="button">
          Sair
        </button>
      </div>

      <RoundSelector
        rounds={rounds}
        activeRoundId={activeRoundId}
        onSelectRound={handleSelectRound}
      />

      {activeTab === 'queue' && bannerMatch && (
        <MatchCountdownBanner subtitle={bannerSubtitle} remainingMs={bannerRemainingMs} />
      )}

      <nav className="app-tabs">
        <button
          type="button"
          data-testid="tab-queue"
          className={`tab-btn ${activeTab === 'queue' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          Fila e partidas
        </button>
        <button
          type="button"
          data-testid="tab-round"
          className={`tab-btn ${activeTab === 'round' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('round')}
        >
          Estatísticas da rodada
        </button>
        <button
          type="button"
          data-testid="tab-global"
          className={`tab-btn ${activeTab === 'global' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('global')}
        >
          Estatísticas globais
        </button>
      </nav>

      {activeTab === 'queue' ? (
        <main className="app-main">
          <Controls
            onAddPlayer={handleAddPlayer}
            onFormTeam={handleFormTeam}
            onSuggestNext={handleSuggestNext}
            suggestion={suggestion}
            onScheduleSuggested={handleScheduleSuggested}
            onExport={handleExport}
            onImport={handleImport}
            onClearLocalCache={handleClearLocalCache}
            onRunMaintenance={handleRunMaintenance}
            activeRoundId={activeRoundId}
            teamSize={teamSize}
            onTeamSizeChange={setTeamSize}
            timerMatchOptions={timerMatchOptions}
            timerTargetMatchId={timerTargetMatchId}
            onTimerMatchChange={handleTimerMatchPick}
            timerTargetMatch={timerTargetMatch}
            clockNow={clockNow}
            onTimerPresetStart={handleTimerPresetStart}
            onTimerSetDuration={handleSetMatchTimerDuration}
            onTimerStart={handleStartMatchCountdown}
            onTimerClear={handleClearMatchCountdown}
          />
          <div className="center-column">
            <div
              className="panel unavailable-summary"
              data-testid="unavailable-summary"
              aria-live="polite"
            >
              <p className="unavailable-summary-line">
                <span className="unavailable-stat-injured">
                  <strong>{unavailableSummary.injured}</strong> lesionados
                </span>
                <span className="unavailable-sep" aria-hidden>
                  ·
                </span>
                <span className="unavailable-stat-tired">
                  <strong>{unavailableSummary.tired}</strong> cansados
                </span>
                <span className="unavailable-sep" aria-hidden>
                  ·
                </span>
                <span
                  className="unavailable-stat-without-team"
                  title={
                    activeRoundId
                      ? 'Jogadores de linha disponíveis (não lesionados/cansados, não só-goleiro) sem time em campo ou na fila de espera desta rodada'
                      : 'Selecione uma rodada'
                  }
                >
                  <strong>{linePlayersWithoutTeam}</strong> sem time
                </span>
                <span className="unavailable-sep" aria-hidden>
                  ·
                </span>
                <span className="unavailable-stat-total">
                  <strong>{unavailableSummary.total}</strong> fora da fila
                </span>
              </p>
            </div>
            <MatchHistory
              matches={matches}
              teams={teams}
              teamLabelById={teamLabelById}
              matchScores={matchScores}
              onEditStats={(m) => setStatsModalMatch(m)}
              onEditScheduledMatch={(m) => setEditMatch(m)}
              onDeleteMatch={handleDeleteMatch}
            />
            <QueueList
              players={players.filter((p) => !p.goalkeeperOnly)}
              onRemove={handleRemovePlayer}
              onRestore={handleRestorePlayer}
              onEditPlayer={(p) => setEditPlayer(p)}
              waitingTeams={fifoWaitingTeams}
            />
            <GoalkeeperQueuePanel players={players} onDeletePlayer={handleGoalkeeperPanelDelete} />
          </div>
          <div className="right-column">
            <div className="panel teams-panel" data-testid="teams-in-field-panel">
              <h2>Times em campo ({teamsInField.length})</h2>
              {teamsInField.length === 0 ? (
                <p className="empty-message">Nenhum time em campo nesta rodada.</p>
              ) : (
                <div className="teams-grid teams-grid-in-field">
                  {teamsInField.map((team) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      allPlayers={players}
                      playerFilaNumberById={playerFilaNumberById}
                      label={teamLabelById[team.id] || 'Time'}
                      onEditTeam={(t, lbl) => {
                        setEditTeam(t);
                        setEditTeamDefaultLabel(lbl);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="panel teams-panel teams-waiting-panel" data-testid="teams-waiting-panel">
              <h2>Próximos na fila ({fifoWaitingTeams.length})</h2>
              <WaitingTeamsList
                teams={fifoWaitingTeams}
                allPlayers={players}
                teamLabelById={teamLabelById}
                playerFilaNumberById={playerFilaNumberById}
                waitingQueueIndexByTeamId={waitingQueueIndexByTeamId}
                onEditTeam={(t, lbl) => {
                  setEditTeam(t);
                  setEditTeamDefaultLabel(lbl);
                }}
              />
            </div>
          </div>
        </main>
      ) : activeTab === 'round' ? (
        <main className="app-main-stats">
          <RoundStatistics rows={roundStatsRows} />
        </main>
      ) : (
        <main className="app-main-stats">
          <PlayerStats
            players={playersForGlobalStats}
            onRecordGoal={handleRecordGoal}
            onRemoveGoal={handleRemoveGoal}
            onRecordAssist={handleRecordAssist}
            onRemoveAssist={handleRemoveAssist}
            showWinDrawLoss
          />
        </main>
      )}

      {statsModalMatch && activeRoundId && (
        <MatchStatsModal
          match={statsModalMatch}
          teams={teams}
          allPlayers={players}
          roundId={activeRoundId}
          onClose={() => setStatsModalMatch(null)}
          onSaved={() => {
            toast.success('Stats salvas.');
            refreshData();
          }}
          onFinalizeFromStats={
            statsModalMatch.status === 'scheduled'
              ? (result) => handleFinalizeScheduled(statsModalMatch.id, result)
              : undefined
          }
          onRequestDrawFromStats={
            statsModalMatch.status === 'scheduled'
              ? () => handleRequestDraw(statsModalMatch)
              : undefined
          }
        />
      )}

      {drawTiebreakerMatch && (
        <DrawTiebreakerModal
          match={drawTiebreakerMatch}
          teams={teams}
          onPick={handleTiebreakerPick}
          onCancel={() => setDrawTiebreakerMatch(null)}
        />
      )}

      {editPlayer && (
        <EditPlayerModal
          player={editPlayer}
          onClose={() => setEditPlayer(null)}
          onSave={handleSavePlayerName}
          onDelete={handleDeletePlayerPermanent}
        />
      )}

      {editTeam && (
        <EditTeamModal
          team={editTeam}
          defaultLabel={editTeamDefaultLabel}
          allPlayers={players}
          roundTeams={teams}
          teamSize={teamSize}
          onClose={() => setEditTeam(null)}
          onSave={handleSaveTeam}
          onDelete={handleDeleteTeam}
        />
      )}

      {editMatch && activeRoundId && (
        <EditScheduledMatchModal
          match={editMatch}
          teams={teams}
          teamLabelById={teamLabelById}
          teamSize={teamSize}
          onClose={() => setEditMatch(null)}
          onSave={handleSaveScheduledTeams}
          onCancelMatch={handleCancelScheduledMatch}
        />
      )}

      <footer className="app-footer">
        <p>Arjen — IndexedDB v3</p>
      </footer>
    </div>
  );
}
