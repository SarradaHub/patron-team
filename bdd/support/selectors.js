export const appSelectors = {
  login: {
    username: '#login-user',
    password: '#login-pass',
    submit: 'button:has-text("Entrar")',
  },
  tabs: {
    queue: '[data-testid="tab-queue"]',
    round: '[data-testid="tab-round"]',
    global: '[data-testid="tab-global"]',
  },
  controls: {
    addPlayerInput: '[data-testid="add-player-input"]',
    addPlayerButton: '[data-testid="add-player-submit"]',
    teamSizeInput: '[data-testid="team-size-input"]',
    formTeamButton: '[data-testid="form-team-button"]',
    suggestMatchButton: '[data-testid="suggest-match-button"]',
    scheduleSuggestedButton: '[data-testid="schedule-suggested-button"]',
    exportButton: '[data-testid="export-data-button"]',
    importButton: '[data-testid="import-data-button"]',
    clearLocalCacheButton: '[data-testid="clear-local-cache-button"]',
  },
  round: {
    activePanel: '[data-testid="round-panel"]',
    selector: '[data-testid="round-select"]',
  },
  queue: {
    playersPanel: '[data-testid="queue-panel"]',
    matchPanel: '[data-testid="matches-panel"]',
    teamsFieldPanel: '[data-testid="teams-in-field-panel"]',
    teamsWaitingPanel: '[data-testid="teams-waiting-panel"]',
  },
};
