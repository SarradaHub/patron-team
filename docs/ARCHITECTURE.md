# Arquitetura — Arjen IndexedDB

## Visão Geral

A aplicação segue uma arquitetura simples de **camada de dados + componentes React**,
com IndexedDB como persistência local e BroadcastChannel para sincronização entre abas.

```
┌─────────────────────────────────────────────────────┐
│                    Navegador                         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Aba 1   │  │  Aba 2   │  │  Service Worker  │  │
│  │  (React) │  │  (React) │  │  (Cache offline) │  │
│  └────┬─────┘  └────┬─────┘  └──────────────────┘  │
│       │              │                               │
│       │  BroadcastChannel                            │
│       │◄────────────►│                               │
│       │              │                               │
│       ▼              ▼                               │
│  ┌──────────────────────────┐                        │
│  │       indexeddb.js        │  ← API de dados       │
│  │    (transações atômicas)  │                        │
│  └────────────┬─────────────┘                        │
│               │                                      │
│               ▼                                      │
│  ┌──────────────────────────┐                        │
│  │    IndexedDB (teamQueueDB)│                       │
│  │                           │                       │
│  │  ┌─────────┐ ┌────────┐ ┌─────────┐              │
│  │  │ players │ │ teams  │ │ rounds  │              │
│  │  └─────────┘ └────────┘ └─────────┘              │
│  │  ┌─────────┐ ┌──────────────┐ ┌──────┐           │
│  │  │ matches │ │ player_stats │ │ meta │           │
│  │  └─────────┘ └──────────────┘ └──────┘           │
│  └──────────────────────────┘                        │
└─────────────────────────────────────────────────────┘
```

## Object Stores

### players
| Campo      | Tipo     | Descrição                                    |
|-----------|----------|----------------------------------------------|
| id        | string   | UUID (keyPath)                               |
| name      | string   | Nome do jogador                              |
| status    | string   | `available` \| `in_field` \| `injured` \| `tired` |
| joinedAt  | string   | ISO timestamp de entrada na fila             |
| goals     | number   | Quantidade de gols marcados (padrão: 0)      |
| assists   | number   | Quantidade de assistências (padrão: 0)       |

**Índices:**
- `joinedAt` — Para ordenação FIFO
- `status` — Para filtrar por status

### rounds
| Campo     | Tipo     | Descrição                    |
|----------|----------|------------------------------|
| id       | string   | UUID (keyPath)               |
| name     | string   | Nome exibido na UI           |
| createdAt| string   | ISO                          |
| updatedAt| string   | ISO                          |
| status   | string   | `active` \| `archived`       |

### meta
| Campo | Tipo   | Descrição                          |
|-------|--------|------------------------------------|
| key   | string | keyPath (ex.: `activeRoundId`)     |
| value | string | ID da rodada ativa na UI           |

### teams
| Campo     | Tipo       | Descrição                          |
|----------|------------|-------------------------------------|
| id       | string     | UUID (keyPath)                     |
| roundId  | string     | Rodada à qual o time pertence      |
| players  | string[]   | Array de IDs de jogadores          |
| status   | string     | `in_field` \| `waiting`            |
| isBlocked| boolean    | Excluído da sugestão MVP / rebalance |
| createdAt| string     | ISO timestamp de criação           |

**Índices:**
- `status` — Para filtrar times em campo/aguardando
- `roundId` — Listar times da rodada

### matches
| Campo          | Tipo     | Descrição                              |
|---------------|----------|----------------------------------------|
| id            | string   | UUID (keyPath)                         |
| roundId       | string   | Rodada                                 |
| teamA         | string   | ID do time A                           |
| teamB         | string   | ID do time B                           |
| result        | string \| null | `A_win` \| `B_win` \| `draw` (null se agendada) |
| status        | string   | `scheduled` \| `finalized`             |
| draw          | boolean  | Derivado do resultado                  |
| winningTeamId | string \| null | Time vencedor (se não empate)   |
| timestamp     | string   | ISO (última atualização / registro)   |

**Índices:**
- `roundId` — Histórico por rodada

### player_stats
| Campo          | Tipo    | Descrição                    |
|---------------|---------|------------------------------|
| id            | string  | keyPath: `${matchId}-${teamId}-${playerId}` |
| roundId       | string  | Denormalizado                |
| matchId       | string  | Partida                      |
| teamId        | string  | Time na partida              |
| playerId      | string  | Jogador                      |
| goals         | number  | Gols                         |
| assists       | number  | Assistências                 |
| ownGoals      | number  | Gols contra                  |
| wasGoalkeeper | boolean | Goleiro nesta partida        |

**Índices:** `matchId`, `roundId`

**Política:** `players.goals` / `players.assists` permanecem como **totais legados** (aba Estatísticas globais). As **estatísticas da rodada** na UI usam apenas `player_stats` das partidas finalizadas da rodada (podem divergir dos totais globais até eventual sincronização manual).

---

## Sequência de Transações

### formTeam(size, roundId)

```
1. Abrir transação readwrite em [players, teams, rounds]
2. Validar existência da rodada
3. Abrir cursor no índice joinedAt (players)
4. Para cada cursor:
   a. Se player.status === 'available' E selecionados < size:
      - Atualizar player.status = 'in_field'
      - cursor.update(player)
      - Adicionar player.id à lista
   b. Avançar cursor
5. Se selecionados < size:
   → ABORT transação (jogadores insuficientes)
6. Criar objeto team:
   { id: UUID, roundId, players: [...ids], status: 'in_field', isBlocked: false, createdAt: now }
7. Inserir team na store 'teams'
8. COMMIT (automático ao completar)
```

**Garantia de atomicidade:** Se qualquer passo falhar, a transação inteira é revertida e nenhum jogador é marcado como `in_field`.

### rebalanceTeams

- **rebalanceTeams(roundId, { activeTeamsOnly }):** coleta jogadores dos times `in_field` (opcionalmente só não bloqueados), ordena times por `createdAt`, redistribui em round-robin e grava os elencos. A tela não chama esta função.

### scheduleMatch / finalizeMatch

- **scheduleMatch:** insere partida com `status: 'scheduled'`, `result: null`.
- **finalizeMatch(matchId, result):** na mesma transação, dissolve o perdedor (ou os dois, no empate) na fila e grava a próxima partida planejada com os times ainda presentes. Um erro desfaz o resultado e a próxima partida.

### bulkUpsertPlayerStats

Valida elenco (jogador pertence ao time na partida), executa `validateMatchPlayerStats` (`src/domain/playerStatRules.js`), apaga stats antigas do `matchId` e grava novas linhas.

### removePlayer(playerId, reason, substitute, roundId?)

```
1. Abrir transação readwrite em [players, teams]
2. Buscar jogador por ID
3. Salvar status anterior
4. Atualizar player.status = reason (injured | tired)
5. SE substitute === true E status anterior === 'in_field':
   a. Encontrar o time do jogador (buscar por status 'in_field')
   b. Abrir cursor no índice joinedAt (players)
   c. Encontrar primeiro player com status === 'available'
   d. Marcar substituto como 'in_field' (reserva atômica)
   e. Atualizar array team.players: trocar ID removido pelo ID do substituto
6. COMMIT
```

---

## Sincronização entre Abas

```
Aba 1 faz operação (ex: addPlayer)
  │
  ├─ Executa transação no IndexedDB
  │
  └─ broadcastChannel.postMessage({ type: 'player_added', timestamp })
        │
        ▼
     BroadcastChannel 'team-queue-sync'
        │
        ▼
     Aba 2 recebe mensagem
        │
        └─ Callback chama refreshData() → recarrega tudo do IndexedDB
```

## Domínio (JS puro)

- `src/domain/playerStatRules.js` — invariantes tipo SLF `PlayerStat`.
- `src/domain/nextMatchEngine.js` — sugestão MVP de confronto (dois primeiros times em campo não bloqueados).

## Componentes React

```
App
├── RoundSelector (rodada ativa + nova rodada)
├── Abas: Fila e partidas | Estatísticas globais | Estatísticas da rodada
│
├── [Fila e partidas]
│   ├── Controls (formar N times, rebalancear, sugerir/agendar, partida rápida, backup)
│   ├── QueueList
│   └── TeamCard + MatchHistory (+ modal MatchStatsModal)
│
├── [Estatísticas globais]
│   └── PlayerStats (gols e assistências somados de player_stats)
│
└── [Estatísticas da rodada]
    └── RoundStatistics (agregado via getRoundStatistics)
```

Gols e assistências são gravados no card da partida (`bulkUpsertPlayerStats`). As duas abas de estatísticas leem `player_stats`.

**Migrações:** v1 → stores base; v2 → `goals`/`assists` em players; v3 → `rounds`, `meta`, `player_stats`, índices `roundId`, rodada padrão “Importado” e backfill em times/partidas existentes.

**Export JSON:** `schemaVersion: 3`, inclui `rounds`, `meta`, `player_stats`. Import sem `rounds` cria rodada única e preenche `roundId`.

## PWA / Service Worker

- **Estratégia:** Cache First com fallback para rede
- **Recursos cacheados:** HTML, CSS, JS (assets do build)
- **Dados:** Persistidos no IndexedDB (não no cache do SW)

