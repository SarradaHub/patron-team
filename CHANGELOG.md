# Changelog

Todas as mudanças relevantes do projeto são documentadas aqui.

## [1.2.0] - 2026-04-09

### Adicionado
- IndexedDB **v3**: `rounds`, `meta`, `player_stats`; `roundId` em times e partidas; migração a partir de v2.
- Formação **múltiplos times** (`formTeamsForRound`), **rebalanceamento** (`rebalanceTeams`), **toggle** de time bloqueado.
- Partidas **agendadas** (`scheduleMatch`) e **finalização** (`finalizeMatch`); stats por partida (`bulkUpsertPlayerStats`) com regras em `src/domain/playerStatRules.js`.
- **Sugestão MVP** de confronto (`suggestNextMatchForRound` + `nextMatchEngine.js`).
- **Estatísticas da rodada** (`getRoundStatistics`) e terceira aba na UI; seletor de rodada (`RoundSelector`); modal `MatchStatsModal`.
- Export/import com `schemaVersion: 3`, `rounds`, `meta`, `player_stats`.
- Service worker cache `team-queue-v3`.

### Alterado
- `formTeam(size, roundId)` e `recordMatch(roundId, ...)` passam a exigir rodada; `removePlayer` aceita `roundId` opcional para substituição.
- README e DOCS/ARCHITECTURE atualizados; testes Vitest para `formTeamsForRound` e `playerStatRules`.

## [1.1.0] - 2026-04-07

### Adicionado
- **Módulo de Estatísticas de Jogadores** — Nova aba "📊 Estatísticas" na UI
  - Tabela com todos os jogadores mostrando gols, assistências e total
  - Botões +/- para registrar/corrigir gols e assistências
  - Filtro por nome de jogador
  - Ordenação por nome, gols, assistências ou total (clique nos cabeçalhos)
  - Resumo geral com totais de jogadores, gols, assistências e participações
- Campos `goals` e `assists` no registro de jogadores (IndexedDB v2)
  - Migração automática: jogadores existentes recebem `goals: 0, assists: 0`
- Funções na API IndexedDB:
  - `recordGoal(playerId)` — Registrar gol
  - `removeGoal(playerId)` — Remover gol
  - `recordAssist(playerId)` — Registrar assistência
  - `removeAssist(playerId)` — Remover assistência
  - `getPlayerStats()` — Listar jogadores com stats normalizadas
- Navegação por abas entre "Fila & Partidas" e "Estatísticas"
- **Deploy no GitHub Pages:**
  - Workflow GitHub Actions em `.github/workflows/deploy-gh-pages.yml`
  - Pacote `gh-pages` e script `npm run deploy` para deploy manual
  - `base` path configurável via variável de ambiente `VITE_BASE_PATH`
- Caminhos relativos no `manifest.json`, `sw.js` e `index.html` para compatibilidade com GitHub Pages

### Alterado
- Versão do banco IndexedDB atualizada de 1 para 2
- Cache do Service Worker atualizado para `team-queue-v2`
- Dataset de exemplo no README agora inclui campos `goals` e `assists`
- README atualizado com documentação completa das estatísticas e deploy no GH Pages

## [1.0.0] - 2026-04-02

### Adicionado
- Implementação completa da API IndexedDB (`indexeddb.js`)
  - `openDB()` — Abertura/criação do banco `teamQueueDB`
  - `addPlayer(name)` — Adicionar jogador à fila
  - `getPlayers()` — Listar jogadores ordenados por FIFO
  - `formTeam(size)` — Formar time com transação atômica
  - `removePlayer(id, reason, substitute)` — Remover/substituir jogador
  - `recordMatch(teamAId, teamBId, result)` — Registrar resultado de partida
  - `exportData()` / `importData(json)` — Backup e restauração
  - `onChange(callback)` — Sincronização via BroadcastChannel
- Componentes React
  - `QueueList` — Fila de jogadores com ações rápidas
  - `TeamCard` — Card de time em campo
  - `MatchHistory` — Histórico de partidas
  - `Controls` — Painel de controles
- PWA com Service Worker e manifest.json
- Testes unitários com Vitest e fake-indexeddb
- Documentação completa em Português
  - README.md com instruções de instalação, uso e deploy
  - DOCS/ARCHITECTURE.md com diagramas e sequências de transações
- CSS responsivo com design minimalista
- Notificações toast para feedback ao usuário

