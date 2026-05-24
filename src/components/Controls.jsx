import React, { useState, useRef, useEffect } from 'react';
import {
  SCHEDULED_MATCH_TIMER_MAX_MINUTES,
  SCHEDULED_MATCH_TIMER_MIN_MINUTES,
} from '../api/indexeddb.js';
import { formatCountdownRemainingMs } from '../domain/countdownFormat.js';
import ConfirmDialog from './ConfirmDialog.jsx';

const CLEAR_CACHE_CONFIRM_MESSAGE =
  'Apagar todos os dados locais (fila, times, partidas)? Não afeta a nuvem. Exporte antes se precisar do backup.';

/**
 * Controles: jogadores, formar todos os times possíveis (limite N), sugestão de partida, backup.
 */
export default function Controls({
  onAddPlayer,
  onFormTeam,
  onSuggestNext,
  suggestion,
  onScheduleSuggested,
  onExport,
  onImport,
  onClearLocalCache,
  onRunMaintenance,
  activeRoundId,
  teamSize,
  onTeamSizeChange,
  timerMatchOptions = [],
  timerTargetMatchId,
  onTimerMatchChange,
  timerTargetMatch,
  clockNow,
  onTimerPresetStart,
  onTimerSetDuration,
  onTimerStart,
  onTimerClear,
}) {
  const [playerName, setPlayerName] = useState('');
  const [addAsGoalkeeperOnly, setAddAsGoalkeeperOnly] = useState(false);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const fileInputRef = useRef(null);
  const [minDraft, setMinDraft] = useState('10');

  useEffect(() => {
    if (!timerTargetMatch) {
      setMinDraft('10');
      return;
    }
    setMinDraft(String(timerTargetMatch.timerDurationMinutes ?? 10));
  }, [timerTargetMatch?.id, timerTargetMatch?.timerDurationMinutes]);

  const handleAddPlayer = (e) => {
    e.preventDefault();
    if (playerName.trim()) {
      onAddPlayer(playerName.trim(), { goalkeeperOnly: addAsGoalkeeperOnly });
      setPlayerName('');
      setAddAsGoalkeeperOnly(false);
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        onImport(json);
      } catch {
        alert('Erro ao ler arquivo JSON. Verifique o formato.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const canAct = Boolean(activeRoundId);
  const now = typeof clockNow === 'number' ? clockNow : Date.now();
  const timerRunning = Boolean(timerTargetMatch?.countdownEndsAt);
  const timerRemainingMs = timerTargetMatch?.countdownEndsAt
    ? new Date(timerTargetMatch.countdownEndsAt).getTime() - now
    : 0;
  const canUseTimer = canAct && timerTargetMatch;
  const needPickMatch = canAct && timerMatchOptions.length > 1 && !timerTargetMatchId;

  const commitDurationDraft = () => {
    if (!timerTargetMatch || timerRunning) return;
    const n = parseInt(minDraft, 10);
    if (!Number.isFinite(n)) {
      setMinDraft(String(timerTargetMatch.timerDurationMinutes ?? 10));
      return;
    }
    const clamped = Math.min(
      SCHEDULED_MATCH_TIMER_MAX_MINUTES,
      Math.max(SCHEDULED_MATCH_TIMER_MIN_MINUTES, Math.round(n))
    );
    setMinDraft(String(clamped));
    onTimerSetDuration(timerTargetMatch.id, clamped);
  };

  return (
    <div className="panel controls-panel" data-testid="controls-panel">
      <h2>Controles</h2>
      {!canAct && <p className="info-message">Carregando rodada…</p>}

      <section className="control-section">
        <h3>Adicionar jogador</h3>
        <form onSubmit={handleAddPlayer} className="add-player-form">
          <input
            type="text"
            data-testid="add-player-input"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Nome do jogador..."
            className="input-text"
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canAct}
            data-testid="add-player-submit"
          >
            Adicionar
          </button>
        </form>
        <label className="modal-form-label modal-checkbox-row" htmlFor="add-player-gk-only">
          <input
            id="add-player-gk-only"
            type="checkbox"
            checked={addAsGoalkeeperOnly}
            onChange={(e) => setAddAsGoalkeeperOnly(e.target.checked)}
            disabled={!canAct}
          />
          Só goleiro (não entra na fila de linha nem na formação automática)
        </label>
      </section>

      <section className="control-section">
        <h3>Limite de jogadores por time</h3>
        <p className="info-message subtle">
          Use o mesmo número ao formar time e ao calcular a próxima partida automática.
        </p>
        <div className="form-row">
          <label htmlFor="teamSize">Jogadores por time:</label>
          <input
            id="teamSize"
            type="number"
            data-testid="team-size-input"
            min="1"
            max="20"
            value={teamSize}
            onChange={(e) => onTeamSizeChange(Number(e.target.value))}
            className="input-number"
          />
          <button
            type="button"
            onClick={() => onFormTeam(teamSize)}
            className="btn btn-success"
            disabled={!canAct}
            data-testid="form-team-button"
          >
            Formar todos os times possíveis
          </button>
        </div>
      </section>

      <section className="control-section controls-timer-section" data-testid="controls-timer-section">
        <h3>Cronômetro da partida</h3>
        <p className="info-message subtle">
          Contagem regressiva para a partida agendada. Atalhos 5 / 10 / 15 min iniciam na hora; ou ajuste os
          minutos e use Iniciar.
        </p>
        {!canAct && <p className="info-message">Carregando rodada…</p>}
        {canAct && timerMatchOptions.length === 0 && (
          <p className="info-message">Agende uma partida para usar o cronômetro.</p>
        )}
        {canAct && timerMatchOptions.length > 1 && (
          <div className="form-row controls-timer-pick-row">
            <label htmlFor="controls-timer-match">Partida agendada</label>
            <select
              id="controls-timer-match"
              data-testid="controls-timer-match-select"
              className="input-text controls-timer-select"
              value={timerTargetMatchId || ''}
              onChange={(e) => onTimerMatchChange(e.target.value || null)}
            >
              <option value="">Escolha a partida…</option>
              {timerMatchOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {needPickMatch && (
          <p className="info-message warning-text">Selecione qual partida agendada usar no cronômetro.</p>
        )}
        {canUseTimer && !needPickMatch && (
          <div className="controls-timer-body">
            {timerRunning ? (
              <>
                <div
                  className={`controls-timer-display${
                    timerRemainingMs <= 0 ? ' controls-timer-display--expired' : ''
                  }`}
                  data-testid="controls-timer-display"
                >
                  {formatCountdownRemainingMs(timerRemainingMs)}
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  data-testid="controls-timer-clear"
                  onClick={() => onTimerClear(timerTargetMatch.id)}
                >
                  Zerar
                </button>
              </>
            ) : (
              <>
                <div className="match-timer-presets">
                  {[5, 10, 15].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="btn btn-primary btn-sm"
                      data-testid={`controls-timer-preset-${m}`}
                      onClick={() => onTimerPresetStart(timerTargetMatch.id, m)}
                    >
                      {m} min e iniciar
                    </button>
                  ))}
                </div>
                <div className="form-row controls-timer-edit-row">
                  <label htmlFor="controls-timer-minutes" className="modal-form-label" style={{ marginBottom: 0 }}>
                    Duração (min)
                    <input
                      id="controls-timer-minutes"
                      type="number"
                      data-testid="controls-timer-minutes-input"
                      className="input-number match-timer-minutes"
                      min={SCHEDULED_MATCH_TIMER_MIN_MINUTES}
                      max={SCHEDULED_MATCH_TIMER_MAX_MINUTES}
                      value={minDraft}
                      onChange={(e) => setMinDraft(e.target.value)}
                      onBlur={commitDurationDraft}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    data-testid="controls-timer-save-duration"
                    onClick={commitDurationDraft}
                  >
                    Salvar duração
                  </button>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    data-testid="controls-timer-start"
                    onClick={() => onTimerStart(timerTargetMatch.id)}
                  >
                    Iniciar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="control-section">
        <h3>Próxima partida (sugestão)</h3>
        <button
          type="button"
          className="btn btn-outline"
          disabled={!canAct}
          onClick={() => onSuggestNext()}
          data-testid="suggest-match-button"
        >
          Sugerir confronto
        </button>
        {suggestion?.ok && (
          <p className="info-message">
            Dois primeiros times em campo (não bloqueados). Agende para registrar no histórico.
          </p>
        )}
        {suggestion && !suggestion.ok && (
          <p className="info-message warning-text">{suggestion.error}</p>
        )}
        {suggestion?.ok && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canAct}
            onClick={() => onScheduleSuggested()}
            data-testid="schedule-suggested-button"
          >
            Agendar partida sugerida
          </button>
        )}
      </section>

      <section className="control-section">
        <h3>Nuvem / Restore</h3>
        <div className="backup-buttons">
          <button
            type="button"
            onClick={onExport}
            className="btn btn-outline"
            data-testid="export-data-button"
          >
            Enviar para nuvem
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-outline"
            data-testid="import-data-button"
          >
            Importar dados
          </button>
          <button
            type="button"
            onClick={() => setShowClearCacheConfirm(true)}
            className="btn btn-outline"
            data-testid="clear-local-cache-button"
          >
            Limpar cache local
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
        <p className="info-message subtle">
          Remove dados do navegador (IndexedDB). Não apaga snapshots no Supabase.
        </p>
        {showClearCacheConfirm && (
          <ConfirmDialog
            title="Limpar cache local"
            message={CLEAR_CACHE_CONFIRM_MESSAGE}
            confirmLabel="Apagar dados locais"
            cancelLabel="Cancelar"
            onCancel={() => setShowClearCacheConfirm(false)}
            onConfirm={() => {
              setShowClearCacheConfirm(false);
              onClearLocalCache?.();
            }}
          />
        )}
      </section>

      <section className="control-section">
        <h3>Manutenção</h3>
        <p className="info-message subtle">
          Limpa referências órfãs entre times, partidas e estatísticas.
        </p>
        <button
          type="button"
          className="btn btn-outline"
          disabled={!canAct}
          onClick={() => {
            if (window.confirm('Executar manutenção de dados agora?')) {
              onRunMaintenance();
            }
          }}
        >
          Rodar Garbage Collector
        </button>
      </section>
    </div>
  );
}
