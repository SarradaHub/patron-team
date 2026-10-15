/**
 * indexeddb.js — Camada de acesso a dados com IndexedDB
 *
 * Database: teamQueueDB (versão 3)
 * Stores: players, teams, matches, rounds, meta, player_stats
 *
 * Política: totais em players.goals/assists são legados (import/export); stats oficiais por partida em player_stats.
 * Stats por partida ficam em player_stats; podem divergir até decidir sincronizar ao finalizar.
 */

import { validateMatchPlayerStats } from '../domain/playerStatRules.js';
import {
  getFieldRosterIds,
  isEligibleExternalGoalkeeper,
  isOnEitherFieldRoster,
  isOnFieldRosterForTeam,
} from '../domain/goalkeeperEligibility.js';
import { suggestNextMatch as computeSuggestNextMatch } from '../domain/nextMatchEngine.js';
import { planNextMatch } from '../domain/postMatchFlow.js';
import {
  compareWaitingTeamsQueueOrder,
  sortWaitingTeamsForRound,
} from '../domain/waitingQueueOrder.js';

const DB_NAME = 'teamQueueDB';
const DB_VERSION = 3;

const EXPORT_SCHEMA_VERSION = 3;

let broadcastChannel = null;
try {
  broadcastChannel = new BroadcastChannel('team-queue-sync');
} catch {
  console.warn('BroadcastChannel não disponível neste ambiente.');
}

function notifyChange(type) {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type, timestamp: Date.now() });
  }
}

let dbInstance = null;

export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      const tx = event.target.transaction;

      if (oldVersion < 1) {
        const playersStore = db.createObjectStore('players', { keyPath: 'id' });
        playersStore.createIndex('joinedAt', 'joinedAt', { unique: false });
        playersStore.createIndex('status', 'status', { unique: false });
        const teamsStore = db.createObjectStore('teams', { keyPath: 'id' });
        teamsStore.createIndex('status', 'status', { unique: false });
        db.createObjectStore('matches', { keyPath: 'id' });
      }

      if (oldVersion < 2 && oldVersion >= 1) {
        const playersStore = tx.objectStore('players');
        const cursorReq = playersStore.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const player = cursor.value;
            if (player.goals === undefined) player.goals = 0;
            if (player.assists === undefined) player.assists = 0;
            cursor.update(player);
            cursor.continue();
          }
        };
      }

      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('rounds')) {
          db.createObjectStore('rounds', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('player_stats')) {
          const ps = db.createObjectStore('player_stats', { keyPath: 'id' });
          ps.createIndex('matchId', 'matchId', { unique: false });
          ps.createIndex('roundId', 'roundId', { unique: false });
        }

        const teamsStore = tx.objectStore('teams');
        if (!teamsStore.indexNames.contains('roundId')) {
          teamsStore.createIndex('roundId', 'roundId', { unique: false });
        }
        const matchesStore = tx.objectStore('matches');
        if (!matchesStore.indexNames.contains('roundId')) {
          matchesStore.createIndex('roundId', 'roundId', { unique: false });
        }

        const roundId = crypto.randomUUID();
        const ts = Date.now();
        const now = new Date(ts).toISOString();
        const defaultRound = {
          id: roundId,
          name: `Rodada ${new Date(ts).toLocaleString('pt-BR')}`,
          createdAt: now,
          updatedAt: now,
          status: 'active',
        };
        tx.objectStore('rounds').add(defaultRound);
        tx.objectStore('meta').put({ key: 'activeRoundId', value: roundId });

        const teamsGetAll = teamsStore.getAll();
        teamsGetAll.onsuccess = () => {
          for (const t of teamsGetAll.result) {
            t.roundId = roundId;
            if (t.isBlocked === undefined) t.isBlocked = false;
            teamsStore.put(t);
          }
        };

        const matchesGetAll = matchesStore.getAll();
        matchesGetAll.onsuccess = () => {
          for (const m of matchesGetAll.result) {
            m.roundId = roundId;
            m.status = 'finalized';
            m.draw = m.result === 'draw';
            if (m.result === 'A_win') m.winningTeamId = m.teamA;
            else if (m.result === 'B_win') m.winningTeamId = m.teamB;
            else m.winningTeamId = null;
            matchesStore.put(m);
          }
        };
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------- Meta / rodadas ----------

async function metaGet(key) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readonly');
  const row = await promisify(tx.objectStore('meta').get(key));
  return row ? row.value : null;
}

async function metaSet(key, value) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getActiveRoundId() {
  return metaGet('activeRoundId');
}

export async function setActiveRoundId(roundId) {
  await metaSet('activeRoundId', roundId);
  notifyChange('active_round_changed');
}

/** Rótulo padrão da rodada com instante único (Date.now). */
export function defaultRoundLabel() {
  const ts = Date.now();
  return `Rodada ${new Date(ts).toLocaleString('pt-BR')}`;
}

/** Garante meta activeRoundId (ex.: após import antigo sem meta). */
export async function ensureDefaultActiveRound() {
  let id = await getActiveRoundId();
  if (id) {
    const r = await getRound(id);
    if (r) return id;
  }
  const rounds = await getRounds();
  if (rounds.length === 0) {
    const created = await createRound();
    return created.id;
  }
  await setActiveRoundId(rounds[0].id);
  return rounds[0].id;
}

export async function createRound(name) {
  const ts = Date.now();
  const nowIso = new Date(ts).toISOString();
  const label =
    name != null && String(name).trim() ? String(name).trim() : defaultRoundLabel();
  const db = await openDB();
  const round = {
    id: crypto.randomUUID(),
    name: label,
    createdAt: nowIso,
    updatedAt: nowIso,
    status: 'active',
  };
  const tx = db.transaction('rounds', 'readwrite');
  tx.objectStore('rounds').add(round);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await setActiveRoundId(round.id);
  notifyChange('round_created');
  return round;
}

export async function getRounds() {
  const db = await openDB();
  const tx = db.transaction('rounds', 'readonly');
  const all = await promisify(tx.objectStore('rounds').getAll());
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getRound(roundId) {
  const db = await openDB();
  const tx = db.transaction('rounds', 'readonly');
  return promisify(tx.objectStore('rounds').get(roundId));
}

/** Grava `rounds.name`. Vazio volta ao rótulo com data. Não muda o schema. */
export async function updateRoundName(roundId, name) {
  if (!roundId) throw new Error('Rodada não encontrada.');
  const trimmed = name != null ? String(name).trim() : '';
  const label = trimmed || defaultRoundLabel();
  const db = await openDB();
  const tx = db.transaction('rounds', 'readwrite');
  const store = tx.objectStore('rounds');
  const round = await promisify(store.get(roundId));
  if (!round) throw new Error('Rodada não encontrada.');
  round.name = label;
  round.updatedAt = new Date().toISOString();
  store.put(round);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyChange('round_renamed');
  return round;
}

// ---------- Jogadores ----------

export async function addPlayer(name, { goalkeeperOnly = false } = {}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Nome do jogador é obrigatório.');
  }

  const existing = await getPlayers(true);
  let joinedMs = Date.now();
  if (existing.length > 0) {
    const last = existing[existing.length - 1];
    const lastMs = Date.parse(last.joinedAt);
    if (!Number.isNaN(lastMs)) {
      joinedMs = Math.max(joinedMs, lastMs + 1);
    }
  }

  const db = await openDB();
  const gkOnly = Boolean(goalkeeperOnly);
  const player = {
    id: crypto.randomUUID(),
    name: name.trim(),
    status: 'available',
    joinedAt: new Date(joinedMs).toISOString(),
    goals: 0,
    assists: 0,
    preferGoalkeeper: gkOnly,
    goalkeeperOnly: gkOnly,
  };

  const tx = db.transaction('players', 'readwrite');
  tx.objectStore('players').add(player);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      notifyChange('player_added');
      resolve(player);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPlayers(orderByJoinedAt = true) {
  const db = await openDB();
  const tx = db.transaction('players', 'readonly');
  const store = tx.objectStore('players');

  return new Promise((resolve, reject) => {
    let request;
    if (orderByJoinedAt) {
      request = store.index('joinedAt').openCursor(null, 'next');
    } else {
      request = store.openCursor();
    }
    const results = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updatePlayerProfile(
  playerId,
  { name, preferGoalkeeper, goalkeeperOnly } = {}
) {
  const hasName = typeof name === 'string';
  const hasPreferGoalkeeper = typeof preferGoalkeeper === 'boolean';
  const hasGoalkeeperOnly = typeof goalkeeperOnly === 'boolean';
  if (!hasName && !hasPreferGoalkeeper && !hasGoalkeeperOnly) {
    throw new Error('Nada para atualizar no jogador.');
  }
  if (hasName && !name.trim()) {
    throw new Error('Nome do jogador é obrigatório.');
  }
  const db = await openDB();
  const tx = db.transaction('players', 'readwrite');
  const store = tx.objectStore('players');
  return new Promise((resolve, reject) => {
    const g = store.get(playerId);
    g.onsuccess = () => {
      const p = g.result;
      if (!p) {
        tx.abort();
        reject(new Error('Jogador não encontrado.'));
        return;
      }
      if (hasName) p.name = name.trim();
      if (hasGoalkeeperOnly) {
        p.goalkeeperOnly = goalkeeperOnly;
        if (goalkeeperOnly) p.preferGoalkeeper = true;
      } else if (hasPreferGoalkeeper && !p.goalkeeperOnly) {
        p.preferGoalkeeper = preferGoalkeeper;
      }
      store.put(p);
    };
    g.onerror = () => reject(g.error);
    tx.oncomplete = () => {
      notifyChange('player_updated');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function updatePlayerName(playerId, name) {
  return updatePlayerProfile(playerId, { name });
}

/**
 * Persist nova ordem da fila (aba "Fila de Jogadores", sem só-goleiro).
 * Reescreve joinedAt em sequência preservando posições relativas dos cadastros só-goleiro
 * na ordenação global.
 *
 * @param {string[]} newLinePlayerIdsInOrder — IDs na ordem desejada (mesmo conjunto que getPlayers filtrado !goalkeeperOnly)
 */
/**
 * Persiste ordem manual da fila de times `waiting` (waitingOrder 1..n).
 * @param {string} roundId
 * @param {string[]} orderedWaitingTeamIds — permutação dos times waiting da rodada
 */
export async function reorderWaitingTeamsInRound(roundId, orderedWaitingTeamIds) {
  if (!roundId) throw new Error('Rodada obrigatória.');
  const roundTeams = await getTeams(roundId);
  const waiting = roundTeams.filter((t) => t.status === 'waiting');
  if (orderedWaitingTeamIds.length !== waiting.length) {
    throw new Error('Lista de times não confere com a fila de espera.');
  }
  const idSet = new Set(waiting.map((t) => t.id));
  for (const id of orderedWaitingTeamIds) {
    if (!idSet.has(id)) {
      throw new Error('Time inválido na reordenação.');
    }
  }
  const byId = Object.fromEntries(waiting.map((t) => [t.id, t]));
  const db = await openDB();
  const tx = db.transaction('teams', 'readwrite');
  const store = tx.objectStore('teams');
  orderedWaitingTeamIds.forEach((id, i) => {
    const t = byId[id];
    store.put({ ...t, waitingOrder: i + 1 });
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      notifyChange('waiting_teams_reordered');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function reorderLinePlayersInQueueOrder(newLinePlayerIdsInOrder) {
  const all = await getPlayers(true);
  const linePlayers = all.filter((p) => !p.goalkeeperOnly);
  const lineIdSet = new Set(linePlayers.map((p) => p.id));
  if (newLinePlayerIdsInOrder.length !== lineIdSet.size) {
    throw new Error('Ordem da fila inválida: quantidade de jogadores de linha não confere.');
  }
  for (const id of newLinePlayerIdsInOrder) {
    if (!lineIdSet.has(id)) {
      throw new Error('Ordem da fila inválida: ID fora da fila de linha.');
    }
  }
  let u = 0;
  const mergedIds = [];
  for (const p of all) {
    if (p.goalkeeperOnly) mergedIds.push(p.id);
    else mergedIds.push(newLinePlayerIdsInOrder[u++]);
  }

  let baseMs = Infinity;
  for (const p of all) {
    const t = Date.parse(p.joinedAt);
    if (!Number.isNaN(t)) baseMs = Math.min(baseMs, t);
  }
  if (!Number.isFinite(baseMs)) baseMs = Date.now();

  const byId = Object.fromEntries(all.map((p) => [p.id, p]));
  const db = await openDB();
  const tx = db.transaction('players', 'readwrite');
  const store = tx.objectStore('players');
  mergedIds.forEach((id, i) => {
    const p = byId[id];
    store.put({ ...p, joinedAt: new Date(baseMs + i).toISOString() });
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      notifyChange('players_queue_reordered');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Times ----------

/**
 * Lista times, opcionalmente filtrados por rodada (índice roundId).
 */
export async function getTeams(roundId = null) {
  const db = await openDB();
  const tx = db.transaction('teams', 'readonly');
  const store = tx.objectStore('teams');
  if (roundId) {
    return new Promise((resolve, reject) => {
      const req = store.index('roundId').getAll(roundId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  return promisify(store.getAll());
}

function enrichMatchRecord(match) {
  const m = { ...match };
  if (!m.result) {
    m.draw = false;
    m.winningTeamId = null;
    return m;
  }
  m.draw = m.result === 'draw';
  if (m.result === 'A_win') m.winningTeamId = m.teamA;
  else if (m.result === 'B_win') m.winningTeamId = m.teamB;
  else m.winningTeamId = null;
  return m;
}

function sortPlayersByJoinedAtThenId(a, b) {
  const ta = new Date(a.joinedAt).getTime();
  const tb = new Date(b.joinedAt).getTime();
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

function maxJoinedAtMsFromPlayerMap(playerMap) {
  let maxMs = 0;
  for (const p of Object.values(playerMap)) {
    if (!p?.joinedAt) continue;
    const t = Date.parse(p.joinedAt);
    if (!Number.isNaN(t)) maxMs = Math.max(maxMs, t);
  }
  return maxMs;
}

/** Próximo slot temporal depois do fim atual da fila (joinedAt). */
function nextRequeueSlotMs(playerMap) {
  return Math.max(Date.now(), maxJoinedAtMsFromPlayerMap(playerMap) + 1);
}

/** joinedAt ISO no fim da fila global; exclui um jogador do cálculo (ex.: vítima). */
function joinedAtIsoEndOfQueueExcluding(playerMap, excludePlayerId) {
  const filtered = {};
  const ex = String(excludePlayerId);
  for (const [k, v] of Object.entries(playerMap)) {
    if (String(k) !== ex) filtered[k] = v;
  }
  return new Date(nextRequeueSlotMs(filtered)).toISOString();
}

/**
 * Volta jogadores ao fim da fila global preservando ordem do array (1 ms entre cada).
 * @returns {number} próximo ms livre após o último atribuído
 */
function rejoinPlayersToQueuePreservingOrder(playerMap, playerIdsInOrder, startSlotMs) {
  let slot = startSlotMs;
  for (const pid of playerIdsInOrder || []) {
    const p = playerMap[pid];
    if (!p) continue;
    p.status = 'available';
    p.joinedAt = new Date(slot).toISOString();
    slot += 1;
  }
  return slot;
}

/** Só atualiza joinedAt em ordem (ex.: elenco in_field). */
function stampJoinedAtStagger(playerMap, playerIdsInOrder, startSlotMs) {
  let slot = startSlotMs;
  for (const pid of playerIdsInOrder || []) {
    const p = playerMap[pid];
    if (!p) continue;
    p.joinedAt = new Date(slot).toISOString();
    slot += 1;
  }
  return slot;
}

/** Só goleiro: fora da fila de linha e da formação automática / substituição em campo. */
function isGoalkeeperOnlyPlayer(p) {
  return Boolean(p?.goalkeeperOnly);
}

function sortRosterIdsByJoinedAt(ids, playerById) {
  return [...(ids || [])].sort((pa, pb) => {
    const a = playerById[String(pa)] ?? playerById[pa];
    const b = playerById[String(pb)] ?? playerById[pb];
    if (!a?.joinedAt && !b?.joinedAt) return String(pa).localeCompare(String(pb));
    const ta = a?.joinedAt ? new Date(a.joinedAt).getTime() : Infinity;
    const tb = b?.joinedAt ? new Date(b.joinedAt).getTime() : Infinity;
    if (ta !== tb) return ta - tb;
    return String(pa).localeCompare(String(pb));
  });
}

function isStatusAvailable(v) {
  if (v === 'available') return true;
  if (typeof v === 'string' && v.toLowerCase() === 'available') return true;
  return false;
}

/** Primeiro do elenco na ordem do card (joinedAt crescente) entre disponiveis. */
function pickFirstAvailableFromRoster(orderedIdsAsc, playerById) {
  for (let i = 0; i < orderedIdsAsc.length; i += 1) {
    const pid = orderedIdsAsc[i];
    const p = playerById[String(pid)] ?? playerById[pid];
    if (p && isStatusAvailable(p.status) && !isGoalkeeperOnlyPlayer(p)) return pid;
  }
  return null;
}

/**
 * Jogador pode preencher vaga no último waiting vindo da “rua” (fora de elenco).
 * Aceita status legado vazio; rejeita lesionado/cansado/em campo.
 */
function canFillWaitingFromBench(p) {
  if (isGoalkeeperOnlyPlayer(p)) return false;
  const s = p?.status;
  if (s === 'in_field' || s === 'injured' || s === 'tired') return false;
  if (isStatusAvailable(s)) return true;
  if (s == null || s === '') return true;
  if (typeof s === 'string' && ['injured', 'tired', 'in_field'].includes(s.toLowerCase())) {
    return false;
  }
  return false;
}

function rosterPlayerIdsSetForRound(allTeams, roundId) {
  const s = new Set();
  for (const t of allTeams) {
    if (t.roundId !== roundId) continue;
    for (const pid of t.players || []) {
      if (pid != null && pid !== '') s.add(String(pid));
    }
  }
  return s;
}

/**
 * Após retirar o substituto do 1º waiting: cada time recebe o 1º disponível do elenco do seguinte
 * (ordem do card). O último waiting tenta receber o 1º da fila global fora de elenco; se não houver,
 * dissolve o último time da fila (jogadores voltam à fila com joinedAt atual), liberando o elenco.
 * @returns {Set<string>} ids de jogadores que precisam de playersStore.put após a cascata
 */
function cascadeWaitingTeamsAfterFieldSubstitution(
  allTeams,
  waitingSorted,
  playerById,
  allPlayersArr,
  roundId,
  subId,
  nowIso
) {
  const playersToPut = new Set();

  if (!waitingSorted.length) {
    throw new Error('Cascata: lista de times em espera vazia.');
  }

  const W = waitingSorted;
  const t0 = W[0];
  t0.players = (t0.players || []).filter((id) => String(id) !== String(subId));

  for (let i = 0; i < W.length - 1; i += 1) {
    const recipient = W[i];
    const donor = W[i + 1];
    const orderedDonor = sortRosterIdsByJoinedAt(donor.players || [], playerById);
    const moved = pickFirstAvailableFromRoster(orderedDonor, playerById);
    if (!moved) {
      throw new Error(
        'Cascata: não há jogador disponível no time seguinte da fila para subir o elenco.'
      );
    }
    donor.players = (donor.players || []).filter((id) => String(id) !== String(moved));
    recipient.players = [...(recipient.players || []), moved];
  }

  const last = W[W.length - 1];
  const onRoster = rosterPlayerIdsSetForRound(allTeams, roundId);
  const subStr = String(subId);
  const freeCandidates = allPlayersArr
    .filter(
      (p) =>
        canFillWaitingFromBench(p) &&
        !onRoster.has(String(p.id)) &&
        String(p.id) !== subStr
    )
    .sort(sortPlayersByJoinedAtThenId);

  const freePick = freeCandidates[0];
  if (!freePick) {
    const victim = W[W.length - 1];
    for (const pid of victim.players || []) {
      const p = playerById[String(pid)];
      if (p) {
        p.status = 'available';
        p.joinedAt = nowIso;
        playersToPut.add(String(pid));
      }
    }
    victim.players = [];
    return playersToPut;
  }
  last.players = [...(last.players || []), freePick.id];
  return playersToPut;
}

/** Sem snapshot de jogadores: cai no desempate por waitingOrder / datas. */
export function sortWaitingTeamsByFifo(a, b) {
  return compareWaitingTeamsQueueOrder(a, b, {}, null);
}

/** Maior `waitingOrder` entre times `waiting` da rodada (0 se nenhum). */
function maxWaitingOrderForRound(teams, roundId) {
  let m = 0;
  for (const t of teams) {
    if (t.roundId !== roundId || t.status !== 'waiting') continue;
    const n = Number(t.waitingOrder);
    if (!Number.isNaN(n) && n > m) m = n;
  }
  return m;
}

function stripWaitingQueueFields(team) {
  if (!team) return team;
  delete team.waitingOrder;
  delete team.enteredWaitingAt;
  return team;
}

/**
 * Forma um time na rodada:
 * 1) Pool: jogadores `available` que não estão em time `in_field`.
 *    Podem estar em time `waiting` incompleto (fragmento) para serem absorvidos no novo time.
 *    Se o novo time será `waiting` (já há 2 em campo ou fila de espera), jogadores já alocados em
 *    times `waiting` com elenco completo (>= size) ficam fora do pool — evita “reformar” o mesmo
 *    time em vez de usar a fila livre.
 * 2) Ordena por joinedAt + id (mesma regra da lista “Fila de Jogadores”) e pega os `size` primeiros.
 * 3) Retira esses ids dos elencos `waiting` afetados; insere o novo time.
 * 4) Se não houver jogadores suficientes, falha sem gravar alterações parciais.
 */
export async function formTeam(size, roundId) {
  if (!roundId) throw new Error('roundId é obrigatório.');
  if (!size || size < 1) {
    throw new Error('Tamanho do time deve ser maior que zero.');
  }

  const db = await openDB();
  const tx = db.transaction(['players', 'teams', 'rounds'], 'readwrite');
  const playersStore = tx.objectStore('players');
  const teamsStore = tx.objectStore('teams');
  const roundsStore = tx.objectStore('rounds');

  return new Promise((resolve, reject) => {
    let settled = false;
    const safeReject = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    const safeResolve = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    const roundReq = roundsStore.get(roundId);
    roundReq.onsuccess = () => {
      if (!roundReq.result) {
        tx.abort();
        safeReject(new Error('Rodada não encontrada.'));
        return;
      }

      const teamsReq = teamsStore.index('roundId').getAll(roundId);
      teamsReq.onsuccess = () => {
        const roundTeamsSnapshot = teamsReq.result || [];
        const playersReq = playersStore.getAll();
        playersReq.onsuccess = () => {
          try {
            const rawPlayers = playersReq.result || [];
            const mutablePlayers = rawPlayers.map((p) => ({ ...p }));
            const playerById = Object.fromEntries(mutablePlayers.map((p) => [p.id, p]));

            const isOnInFieldRoster = (playerId) =>
              roundTeamsSnapshot.some(
                (t) => t.status === 'in_field' && (t.players || []).includes(playerId)
              );

            const inFieldBefore = roundTeamsSnapshot.filter(
              (t) => t.roundId === roundId && t.status === 'in_field'
            ).length;
            const hasWaitingTeams = roundTeamsSnapshot.some(
              (t) => t.roundId === roundId && t.status === 'waiting'
            );
            const asWaiting =
              inFieldBefore >= 2 || (hasWaitingTeams && inFieldBefore >= 1);

            const isOnCompleteWaitingRoster = (playerId) =>
              roundTeamsSnapshot.some(
                (t) =>
                  t.roundId === roundId &&
                  t.status === 'waiting' &&
                  (t.players || []).length >= size &&
                  (t.players || []).includes(playerId)
              );

            const formationPool = mutablePlayers
              .filter((p) => {
                if (isGoalkeeperOnlyPlayer(p)) return false;
                if (p.status !== 'available' || isOnInFieldRoster(p.id)) return false;
                if (asWaiting && isOnCompleteWaitingRoster(p.id)) return false;
                return true;
              })
              .sort(sortPlayersByJoinedAtThenId);

            const selected = [];
            const seen = new Set();

            const nextWaitingOrder = asWaiting
              ? maxWaitingOrderForRound(roundTeamsSnapshot, roundId) + 1
              : undefined;

            const tryAdd = (playerId) => {
              if (selected.length >= size || seen.has(playerId)) return;
              const pl = playerById[playerId];
              if (!pl || pl.status !== 'available') return;
              seen.add(playerId);
              selected.push(playerId);
              pl.status = asWaiting ? 'available' : 'in_field';
            };

            for (const p of formationPool) {
              if (selected.length >= size) break;
              tryAdd(p.id);
            }

            if (selected.length === 0) {
              safeReject(
                new Error(
                  'Nenhum jogador disponível na fila. Adicione jogadores ou aguarde retorno à fila.'
                )
              );
              return;
            }

            if (selected.length < size) {
              safeReject(
                new Error(
                  `Jogadores insuficientes para formar um time de ${size}. Necessário: ${size}, disponível: ${selected.length}.`
                )
              );
              return;
            }

            for (const t of roundTeamsSnapshot) {
              if (t.status !== 'waiting') continue;
              const prev = t.players || [];
              const remaining = prev.filter((pid) => !selected.includes(pid));
              if (remaining.length === prev.length) continue;
              if (remaining.length === 0) {
                teamsStore.delete(t.id);
              } else {
                teamsStore.put({ ...t, players: remaining });
              }
            }

            for (const pid of selected) {
              playersStore.put(playerById[pid]);
            }

            const nowIso = new Date().toISOString();
            const team = {
              id: crypto.randomUUID(),
              roundId,
              players: selected,
              status: asWaiting ? 'waiting' : 'in_field',
              isBlocked: false,
              createdAt: nowIso,
              ...(asWaiting && {
                enteredWaitingAt: nowIso,
                waitingOrder: nextWaitingOrder,
              }),
            };
            teamsStore.add(team);

            tx.oncomplete = () => {
              notifyChange('team_formed');
              safeResolve(team);
            };
          } catch (err) {
            tx.abort();
            safeReject(err);
          }
        };
        playersReq.onerror = () => safeReject(playersReq.error);
      };
      teamsReq.onerror = () => safeReject(teamsReq.error);
    };
    roundReq.onerror = () => safeReject(roundReq.error);
    tx.onerror = () => safeReject(tx.error);
    tx.onabort = () => safeReject(tx.error || new Error('Transação abortada.'));
  });
}

function isFormTeamQueueExhaustedError(err) {
  const msg = err?.message || '';
  return (
    msg.includes('Jogadores insuficientes para formar um time') ||
    msg.includes('Nenhum jogador disponível na fila')
  );
}

/**
 * Chama `formTeam` em sequência até não haver jogadores suficientes para mais um time completo.
 * @returns {Promise<Array<object>>} times criados (pode ser vazio só se o primeiro `formTeam` falhar)
 */
export async function formAllTeamsPossible(size, roundId) {
  const created = [];
  let lastErr = null;
  for (;;) {
    try {
      const team = await formTeam(size, roundId);
      created.push(team);
    } catch (err) {
      lastErr = err;
      if (isFormTeamQueueExhaustedError(err)) break;
      throw err;
    }
  }
  if (created.length === 0 && lastErr) throw lastErr;
  return created;
}

/**
 * Forma vários times de uma vez (mesma transação).
 */
export async function formTeamsForRound(roundId, playersPerTeam, teamCount) {
  if (!roundId) throw new Error('roundId é obrigatório.');
  if (!playersPerTeam || playersPerTeam < 1) throw new Error('Jogadores por time inválido.');
  if (!teamCount || teamCount < 1) throw new Error('Quantidade de times inválida.');

  const need = playersPerTeam * teamCount;
  const db = await openDB();
  const tx = db.transaction(['players', 'teams', 'rounds'], 'readwrite');
  const playersStore = tx.objectStore('players');
  const teamsStore = tx.objectStore('teams');
  const roundsStore = tx.objectStore('rounds');

  return new Promise((resolve, reject) => {
    const roundReq = roundsStore.get(roundId);
    roundReq.onsuccess = () => {
      if (!roundReq.result) {
        tx.abort();
        reject(new Error('Rodada não encontrada.'));
        return;
      }

      const selected = [];
      const index = playersStore.index('joinedAt');
      const cursorReq = index.openCursor(null, 'next');

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
          if (cursor && selected.length < need) {
          const player = cursor.value;
          if (player.status === 'available' && !isGoalkeeperOnlyPlayer(player)) {
            selected.push(player.id);
          }
          cursor.continue();
        } else {
          if (selected.length < need) {
            tx.abort();
            reject(
              new Error(
                `Jogadores insuficientes para ${teamCount} times de ${playersPerTeam}. Necessário: ${need}, disponível: ${selected.length}.`
              )
            );
            return;
          }

          const teamsSnapReq = teamsStore.index('roundId').getAll(roundId);
          teamsSnapReq.onsuccess = () => {
            const snap = teamsSnapReq.result || [];
            let virtualInField = snap.filter((t) => t.status === 'in_field').length;
            let wo = maxWaitingOrderForRound(snap, roundId);
            const now = new Date().toISOString();

            const playersMutReq = playersStore.getAll();
            playersMutReq.onsuccess = () => {
              const byId = Object.fromEntries(
                (playersMutReq.result || []).map((p) => [p.id, { ...p }])
              );
              const created = [];
              for (let t = 0; t < teamCount; t += 1) {
                const slice = selected.slice(t * playersPerTeam, (t + 1) * playersPerTeam);
                const asWaiting = virtualInField >= 2;
                const team = {
                  id: crypto.randomUUID(),
                  roundId,
                  players: slice,
                  status: asWaiting ? 'waiting' : 'in_field',
                  isBlocked: false,
                  createdAt: now,
                  ...(asWaiting && { enteredWaitingAt: now, waitingOrder: (wo += 1) }),
                };
                teamsStore.add(team);
                created.push(team);
                for (const pid of slice) {
                  const pl = byId[pid];
                  if (pl) pl.status = asWaiting ? 'available' : 'in_field';
                }
                if (!asWaiting) virtualInField += 1;
              }

              for (const pid of selected) {
                const p = byId[pid];
                if (p) playersStore.put(p);
              }

              tx.oncomplete = () => {
                notifyChange('teams_formed_batch');
                resolve(created);
              };
            };
            playersMutReq.onerror = () => reject(playersMutReq.error);
          };
          teamsSnapReq.onerror = () => reject(teamsSnapReq.error);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    };
    roundReq.onerror = () => reject(roundReq.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

/**
 * Redistribui jogadores entre times em campo não bloqueados da rodada (round-robin).
 */
export async function rebalanceTeams(roundId, { activeTeamsOnly = true } = {}) {
  const db = await openDB();
  const tx = db.transaction(['teams', 'players'], 'readwrite');
  const teamsStore = tx.objectStore('teams');
  const playersStore = tx.objectStore('players');

  return new Promise((resolve, reject) => {
    const idx = teamsStore.index('roundId');
    const req = idx.getAll(roundId);
    req.onsuccess = () => {
      let teams = req.result || [];
      teams = teams.filter((t) => t.status === 'in_field');
      if (activeTeamsOnly) {
        teams = teams.filter((t) => !t.isBlocked);
      }
      teams.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      if (teams.length === 0) {
        tx.abort();
        reject(new Error('Nenhum time em campo para rebalancear.'));
        return;
      }

      const playerIdsOrdered = [];
      for (const t of teams) {
        for (const pid of t.players) {
          playerIdsOrdered.push(pid);
        }
      }

      const n = teams.length;
      const nextPlayers = teams.map(() => []);

      playerIdsOrdered.forEach((pid, i) => {
        nextPlayers[i % n].push(pid);
      });

      for (let i = 0; i < teams.length; i += 1) {
        teams[i].players = nextPlayers[i];
        teamsStore.put(teams[i]);
      }

      tx.oncomplete = () => {
        notifyChange('teams_rebalanced');
        resolve(teams);
      };
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

export async function toggleTeamBlocked(teamId) {
  const db = await openDB();
  const tx = db.transaction('teams', 'readwrite');
  const store = tx.objectStore('teams');
  return new Promise((resolve, reject) => {
    const g = store.get(teamId);
    g.onsuccess = () => {
      const t = g.result;
      if (!t) {
        tx.abort();
        reject(new Error('Time não encontrado.'));
        return;
      }
      t.isBlocked = !t.isBlocked;
      store.put(t);
    };
    tx.oncomplete = () => {
      notifyChange('team_toggled');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateTeamDisplayName(teamId, displayName) {
  const db = await openDB();
  const tx = db.transaction('teams', 'readwrite');
  const store = tx.objectStore('teams');
  return new Promise((resolve, reject) => {
    const g = store.get(teamId);
    g.onsuccess = () => {
      const t = g.result;
      if (!t) {
        tx.abort();
        reject(new Error('Time não encontrado.'));
        return;
      }
      if (displayName == null || (typeof displayName === 'string' && !displayName.trim())) {
        delete t.displayName;
      } else if (typeof displayName === 'string') {
        t.displayName = displayName.trim();
      } else {
        tx.abort();
        reject(new Error('displayName inválido.'));
        return;
      }
      store.put(t);
    };
    g.onerror = () => reject(g.error);
    tx.oncomplete = () => {
      notifyChange('team_updated');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Substitui o elenco do time (ordem preservada). Jogadores que saem voltam à fila global
 * (`available`, novo joinedAt). Novos no elenco devem estar livres (não em outro time da rodada)
 * e com status adequado; quem já estava no elenco pode ser reordenado.
 * Partidas agendadas envolvendo este time têm stats rascunho limpas se o elenco mudar.
 * @param {string[]} nextPlayerIds — ids únicos, ordem do card
 * @param {object} [options] — { teamSize } para validar elenco mínimo se houver partida agendada
 */
export async function updateTeamRoster(teamId, nextPlayerIds, roundId, options = {}) {
  if (!roundId) throw new Error('roundId é obrigatório.');
  const teamSize = options.teamSize ?? 5;
  if (!Array.isArray(nextPlayerIds) || nextPlayerIds.length === 0) {
    throw new Error('O elenco deve ter pelo menos um jogador.');
  }
  const seen = new Set();
  for (const id of nextPlayerIds) {
    if (seen.has(id)) {
      throw new Error('Elenco não pode ter jogadores repetidos.');
    }
    seen.add(id);
  }

  const db = await openDB();
  const tx = db.transaction(['teams', 'players', 'matches', 'player_stats'], 'readwrite');
  const teamsStore = tx.objectStore('teams');
  const playersStore = tx.objectStore('players');
  const matchesStore = tx.objectStore('matches');
  const statsStore = tx.objectStore('player_stats');

  return new Promise((resolve, reject) => {
    const teamReq = teamsStore.get(teamId);
    teamReq.onsuccess = () => {
      const team = teamReq.result;
      if (!team || team.roundId !== roundId) {
        tx.abort();
        reject(new Error('Time não encontrado nesta rodada.'));
        return;
      }

      const teamsRoundReq = teamsStore.index('roundId').getAll(roundId);
      teamsRoundReq.onsuccess = () => {
        const roundTeams = teamsRoundReq.result || [];
        const playersReq = playersStore.getAll();
        playersReq.onsuccess = () => {
          const rawPlayers = playersReq.result || [];
          const playerMap = Object.fromEntries(rawPlayers.map((p) => [p.id, { ...p }]));

          const oldRoster = [...(team.players || [])];
          const oldSet = new Set(oldRoster);

          const otherTeamsRoster = new Set();
          for (const t of roundTeams) {
            if (t.id === teamId) continue;
            for (const pid of t.players || []) {
              otherTeamsRoster.add(pid);
            }
          }

          const rosterChanged =
            JSON.stringify(nextPlayerIds) !== JSON.stringify(oldRoster);

          for (const pid of nextPlayerIds) {
            const p = playerMap[pid];
            if (!p) {
              tx.abort();
              reject(new Error(`Jogador não encontrado: ${pid}.`));
              return;
            }
            if (otherTeamsRoster.has(pid)) {
              tx.abort();
              reject(new Error('Um ou mais jogadores já estão em outro time nesta rodada.'));
              return;
            }
            if (oldSet.has(pid)) continue;
            if (!isStatusAvailable(p.status)) {
              tx.abort();
              reject(
                new Error(
                  'Só é possível incluir jogadores disponíveis na fila (não lesionados, cansados ou em outro time em campo).'
                )
              );
              return;
            }
          }

          const matchesRoundReq = matchesStore.index('roundId').getAll(roundId);
          matchesRoundReq.onsuccess = () => {
            const roundMatches = matchesRoundReq.result || [];
            const schedInvolving = roundMatches.filter(
              (m) =>
                m.status === 'scheduled' &&
                (m.teamA === teamId || m.teamB === teamId)
            );
            if (schedInvolving.length > 0 && nextPlayerIds.length < teamSize) {
              tx.abort();
              reject(
                new Error(
                  `Com partida agendada, o elenco precisa de pelo menos ${teamSize} jogador(es).`
                )
              );
              return;
            }

            const nowIso = new Date().toISOString();
            const targetStatus = team.status === 'in_field' ? 'in_field' : 'available';

            for (const pid of oldRoster) {
              if (!seen.has(pid)) {
                const p = playerMap[pid];
                if (p) {
                  p.status = 'available';
                  p.joinedAt = nowIso;
                  playersStore.put(p);
                }
              }
            }

            for (const pid of nextPlayerIds) {
              const p = playerMap[pid];
              p.status = targetStatus;
              playersStore.put(p);
            }

            const updatedTeam = { ...team, players: [...nextPlayerIds] };
            teamsStore.put(updatedTeam);

            const finish = () => {
              tx.oncomplete = () => {
                notifyChange('team_roster_updated');
                resolve(updatedTeam);
              };
            };

            if (!rosterChanged || schedInvolving.length === 0) {
              finish();
              return;
            }

            let i = 0;
            const runClear = () => {
              if (i >= schedInvolving.length) {
                finish();
                return;
              }
              deletePlayerStatsByMatchCursor(
                statsStore,
                schedInvolving[i].id,
                () => {
                  i += 1;
                  runClear();
                },
                reject
              );
            };
            runClear();
          };
          matchesRoundReq.onerror = () => reject(matchesRoundReq.error);
        };
        playersReq.onerror = () => reject(playersReq.error);
      };
      teamsRoundReq.onerror = () => reject(teamsRoundReq.error);
    };
    teamReq.onerror = () => reject(teamReq.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

/**
 * Remove jogador do banco: tira de todos os elencos, apaga player_stats dele, apaga times vazios.
 */
export async function deletePlayerPermanently(playerId) {
  const db = await openDB();
  const tx = db.transaction(['players', 'teams', 'player_stats'], 'readwrite');
  const playersStore = tx.objectStore('players');
  const teamsStore = tx.objectStore('teams');
  const statsStore = tx.objectStore('player_stats');
  const idStr = String(playerId);

  return new Promise((resolve, reject) => {
    const pReq = playersStore.get(playerId);
    pReq.onsuccess = () => {
      if (!pReq.result) {
        tx.abort();
        reject(new Error('Jogador não encontrado.'));
        return;
      }

      const teamsReq = teamsStore.getAll();
      teamsReq.onsuccess = () => {
        const allTeams = teamsReq.result || [];
        for (const t of allTeams) {
          const orig = t.players || [];
          const next = orig.filter((pid) => String(pid) !== idStr);
          if (next.length === orig.length) continue;
          if (next.length === 0) {
            teamsStore.delete(t.id);
          } else {
            teamsStore.put({ ...t, players: next });
          }
        }

        const statsReq = statsStore.getAll();
        statsReq.onsuccess = () => {
          for (const row of statsReq.result || []) {
            if (String(row.playerId) === idStr) {
              statsStore.delete(row.id);
            }
          }
          playersStore.delete(playerId);
          tx.oncomplete = () => {
            notifyChange('player_deleted');
            resolve();
          };
        };
        statsReq.onerror = () => reject(statsReq.error);
      };
      teamsReq.onerror = () => reject(teamsReq.error);
    };
    pReq.onerror = () => reject(pReq.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

export const TEAM_IN_MATCH_DELETE_MESSAGE =
  'Este time está em uma partida. Use Excluir na partida antes de excluir o time.';

/** Verdadeiro se alguma partida (qualquer status ou rodada) lista este time como lado A ou B. */
export async function teamDeleteBlockedByMatch(teamId) {
  const db = await openDB();
  const readTx = db.transaction('matches', 'readonly');
  const matches = await promisify(readTx.objectStore('matches').getAll());
  return (matches || []).some((m) => m.teamA === teamId || m.teamB === teamId);
}

/**
 * Apaga time se não houver partida (qualquer status) referenciando teamA/teamB.
 * Jogadores do elenco voltam à fila (`available` + joinedAt), como em dissolver time após partida.
 */
export async function deleteTeam(teamId) {
  if (await teamDeleteBlockedByMatch(teamId)) {
    throw new Error(TEAM_IN_MATCH_DELETE_MESSAGE);
  }

  const db = await openDB();
  const writeTx = db.transaction(['teams', 'players'], 'readwrite');
  const teamsStore = writeTx.objectStore('teams');
  const playersStore = writeTx.objectStore('players');
  return new Promise((resolve, reject) => {
    const tReq = teamsStore.get(teamId);
    tReq.onsuccess = () => {
      const team = tReq.result;
      if (!team) {
        writeTx.abort();
        reject(new Error('Time não encontrado.'));
        return;
      }
      const roster = team.players || [];
      const pAll = playersStore.getAll();
      pAll.onsuccess = () => {
        const raw = pAll.result || [];
        const playerMap = Object.fromEntries(raw.map((p) => [p.id, { ...p }]));
        const startSlot = nextRequeueSlotMs(playerMap);
        rejoinPlayersToQueuePreservingOrder(playerMap, roster, startSlot);
        for (const pid of roster) {
          const p = playerMap[pid];
          if (p) playersStore.put(p);
        }
        teamsStore.delete(teamId);
        writeTx.oncomplete = () => {
          notifyChange('team_deleted');
          resolve();
        };
      };
      pAll.onerror = () => reject(pAll.error);
    };
    tReq.onerror = () => reject(tReq.error);
    writeTx.onerror = () => reject(writeTx.error);
    writeTx.onabort = () => reject(writeTx.error || new Error('Transação abortada.'));
  });
}

/** Remove jogador de todos os elencos na transação atual. Times com elenco vazio são apagados. */
function stripPlayerIdFromAllTeamsInTx(teamsStore, victimIdStr, onDone, onErr) {
  const req = teamsStore.getAll();
  req.onsuccess = () => {
    const ex = String(victimIdStr);
    for (const t of req.result || []) {
      const pl = t.players || [];
      if (!pl.some((pid) => String(pid) === ex)) continue;
      const filtered = pl.filter((pid) => String(pid) !== ex);
      if (filtered.length === 0) teamsStore.delete(t.id);
      else teamsStore.put({ ...t, players: filtered });
    }
    onDone();
  };
  req.onerror = () => onErr(req.error);
}

/**
 * Dissolve elenco de um time `waiting`: jogadores voltam à fila com joinedAt preservando ordem.
 */
function dissolveWaitingTeamRosterIntoQueue(team, playerMap, playersStore) {
  const ids = [...(team.players || [])];
  if (ids.length === 0) return;
  const idSet = new Set(ids.map((x) => String(x)));
  const othersMap = Object.fromEntries(
    Object.entries(playerMap).filter(([k]) => !idSet.has(String(k)))
  );
  let slot = nextRequeueSlotMs(othersMap);
  rejoinPlayersToQueuePreservingOrder(playerMap, ids, slot);
  for (const pid of ids) {
    const p = playerMap[String(pid)];
    if (p) playersStore.put(p);
  }
  team.players = [];
}

function persistWaitingTeamsAfterMutation(waitingSorted, teamsStore) {
  for (const t of waitingSorted) {
    if ((t.players || []).length === 0) teamsStore.delete(t.id);
    else teamsStore.put(t);
  }
}

/**
 * Lesão/cansaço em jogador que está no elenco de um time `waiting` (status available).
 * Mesma ideia que em campo: substituto do próximo waiting ou da fila global; cascata na fila.
 * Sem substituto: dissolve o time (elenco volta disponível). Se após operação o time ainda
 * ficar com menos de `rosterTargetSize` jogadores, dissolve o time.
 * @returns {'cascade'|'dissolved'}
 */
function applyInjuryOnWaitingTeamRoster({
  victimIdStr,
  reason,
  waitingSorted,
  teamIndex: k,
  allTeams,
  roundId,
  rosterTargetSize,
  playerMap,
  allPlayers,
  nowIso,
  playersStore,
  teamsStore,
}) {
  const W = waitingSorted;
  const T = W[k];
  const victim = playerMap[victimIdStr];
  if (!T || !victim) throw new Error('Time ou jogador inconsistente na fila de espera.');

  T.players = (T.players || []).filter((id) => String(id) !== victimIdStr);
  victim.status = reason;
  victim.joinedAt = joinedAtIsoEndOfQueueExcluding(playerMap, victimIdStr);
  playersStore.put(victim);

  let subId = null;
  if (k < W.length - 1) {
    const donor = W[k + 1];
    const ordered = sortRosterIdsByJoinedAt(donor.players || [], playerMap);
    subId = pickFirstAvailableFromRoster(ordered, playerMap);
  }
  if (!subId) {
    const onRoster = rosterPlayerIdsSetForRound(allTeams, roundId);
    const freeCandidates = allPlayers
      .filter(
        (p) =>
          canFillWaitingFromBench(p) &&
          !onRoster.has(String(p.id)) &&
          String(p.id) !== victimIdStr
      )
      .sort(sortPlayersByJoinedAtThenId);
    subId = freeCandidates[0] ? freeCandidates[0].id : null;
  }

  if (!subId) {
    dissolveWaitingTeamRosterIntoQueue(T, playerMap, playersStore);
    teamsStore.delete(T.id);
    persistWaitingTeamsAfterMutation(W, teamsStore);
    return 'dissolved';
  }

  if (k < W.length - 1) {
    const donor = W[k + 1];
    donor.players = (donor.players || []).filter((id) => String(id) !== String(subId));
    T.players = [...(T.players || []), subId];
  } else {
    T.players = [...(T.players || []), subId];
  }

  for (let i = k + 1; i < W.length - 1; i += 1) {
    const recipient = W[i];
    const donor = W[i + 1];
    const orderedDonor = sortRosterIdsByJoinedAt(donor.players || [], playerMap);
    const moved = pickFirstAvailableFromRoster(orderedDonor, playerMap);
    if (!moved) {
      throw new Error(
        'Cascata (espera): não há jogador disponível no time seguinte da fila para subir o elenco.'
      );
    }
    donor.players = donor.players.filter((id) => String(id) !== String(moved));
    recipient.players = [...(recipient.players || []), moved];
  }

  const last = W[W.length - 1];
  const onRosterAfter = rosterPlayerIdsSetForRound(allTeams, roundId);
  const freeCandidates = allPlayers
    .filter((p) => canFillWaitingFromBench(p) && !onRosterAfter.has(String(p.id)))
    .sort(sortPlayersByJoinedAtThenId);
  const freePick = freeCandidates[0];
  if (!freePick) {
    for (const pid of last.players || []) {
      const p = playerMap[String(pid)];
      if (p) {
        p.status = 'available';
        p.joinedAt = nowIso;
        playersStore.put(p);
      }
    }
    last.players = [];
    teamsStore.delete(last.id);
  } else {
    last.players = [...(last.players || []), freePick.id];
  }

  if ((T.players || []).length > 0 && T.players.length < rosterTargetSize) {
    dissolveWaitingTeamRosterIntoQueue(T, playerMap, playersStore);
    teamsStore.delete(T.id);
    persistWaitingTeamsAfterMutation(W, teamsStore);
    return 'dissolved';
  }

  persistWaitingTeamsAfterMutation(W, teamsStore);
  return 'cascade';
}

// ---------- removePlayer ----------

/**
 * Marca jogador como lesionado/cansado. Se estava em campo, substitui pelo primeiro jogador
 * disponível do próximo time na fila (`waiting`). O substituto segue a ordem do card (joinedAt
 * crescente). Em seguida a fila de times sobe: cada waiting recebe um jogador do fundo do seguinte;
 * o último waiting recebe o próximo `available` que não está em nenhum elenco da rodada; se não
 * houver ninguém na fila global, o último time waiting é dissolvido (elenco volta à fila).
 * Se não houver time `waiting`, mas houver jogador na fila global fora de elenco, entra esse jogador direto no time em campo (sem cascata na fila de times).
 * Se estiver no elenco de um time `waiting` (jogador ainda `available`), aplica substituição/cascata
 * como na fila de espera após saída em campo; sem substituto ou elenco abaixo do mínimo, dissolve o time.
 * `substitute === false` só marca o status e tira o jogador do elenco, sem puxar outro.
 * `substitute === true` mantém a cascata automática.
 * @param {number} [rosterTargetSize] — alinhado ao “Jogadores por time” da UI (ordem da fila waiting).
 * @returns {Promise<{ substituted: boolean }>}
 */
export async function removePlayer(
  playerId,
  reason,
  substitute = false,
  roundId = null,
  rosterTargetSize = 5
) {
  if (!['injured', 'tired'].includes(reason)) {
    throw new Error("Motivo deve ser 'injured' ou 'tired'.");
  }

  const db = await openDB();
  const tx = db.transaction(['players', 'teams'], 'readwrite');
  const playersStore = tx.objectStore('players');
  const teamsStore = tx.objectStore('teams');

  return new Promise((resolve, reject) => {
    const nowIso = new Date().toISOString();

    const finishNoSub = () => {
      tx.oncomplete = () => {
        notifyChange('player_removed');
        resolve({ substituted: false });
      };
    };

    const finishSub = () => {
      tx.oncomplete = () => {
        notifyChange('player_removed');
        resolve({ substituted: true });
      };
    };

    const getReq = playersStore.get(playerId);
    getReq.onsuccess = () => {
      const player = getReq.result;
      if (!player) {
        tx.abort();
        reject(new Error('Jogador não encontrado.'));
        return;
      }

      const previousStatus = player.status;

      if (previousStatus !== 'in_field') {
        const victimIdStr = String(playerId);
        if (!roundId) {
          const allReq = playersStore.getAll();
          allReq.onsuccess = () => {
            const allPl = allReq.result || [];
            const pmap = Object.fromEntries(allPl.map((p) => [String(p.id), p]));
            const vp = pmap[victimIdStr];
            vp.status = reason;
            vp.joinedAt = joinedAtIsoEndOfQueueExcluding(pmap, vp.id);
            playersStore.put(vp);
            stripPlayerIdFromAllTeamsInTx(teamsStore, victimIdStr, finishNoSub, reject);
          };
          allReq.onerror = () => reject(allReq.error);
          return;
        }

        const teamsEarlyReq = teamsStore.getAll();
        teamsEarlyReq.onsuccess = () => {
          const allTeamsEarly = teamsEarlyReq.result || [];
          const playersEarlyReq = playersStore.getAll();
          playersEarlyReq.onsuccess = () => {
            const allPl = playersEarlyReq.result || [];
            const pmap = Object.fromEntries(allPl.map((p) => [String(p.id), p]));
            const vp = pmap[victimIdStr];
            if (!vp) {
              tx.abort();
              reject(new Error('Jogador não encontrado.'));
              return;
            }

            const waitingSortedEarly = sortWaitingTeamsForRound(
              allTeamsEarly,
              roundId,
              allPl,
              rosterTargetSize
            );
            const kWait = waitingSortedEarly.findIndex((t) =>
              (t.players || []).some((pid) => String(pid) === victimIdStr)
            );

            if (kWait < 0) {
              vp.status = reason;
              vp.joinedAt = joinedAtIsoEndOfQueueExcluding(pmap, vp.id);
              playersStore.put(vp);
              stripPlayerIdFromAllTeamsInTx(teamsStore, victimIdStr, finishNoSub, reject);
              return;
            }

            if (!substitute) {
              const team = waitingSortedEarly[kWait];
              team.players = (team.players || []).filter((pid) => String(pid) !== victimIdStr);
              vp.status = reason;
              vp.joinedAt = joinedAtIsoEndOfQueueExcluding(pmap, vp.id);
              playersStore.put(vp);
              if ((team.players || []).length < rosterTargetSize) {
                dissolveWaitingTeamRosterIntoQueue(team, pmap, playersStore);
                teamsStore.delete(team.id);
              } else {
                teamsStore.put(team);
              }
              finishNoSub();
              return;
            }

            try {
              const outcome = applyInjuryOnWaitingTeamRoster({
                victimIdStr,
                reason,
                waitingSorted: waitingSortedEarly,
                teamIndex: kWait,
                allTeams: allTeamsEarly,
                roundId,
                rosterTargetSize,
                playerMap: pmap,
                allPlayers: allPl,
                nowIso,
                playersStore,
                teamsStore,
              });
              if (outcome === 'cascade') finishSub();
              else finishNoSub();
            } catch (err) {
              tx.abort();
              reject(err);
            }
          };
          playersEarlyReq.onerror = () => reject(playersEarlyReq.error);
        };
        teamsEarlyReq.onerror = () => reject(teamsEarlyReq.error);
        return;
      }

      const teamsReq = teamsStore.getAll();
      teamsReq.onsuccess = () => {
        const allTeams = teamsReq.result || [];
        const playersReq = playersStore.getAll();
        playersReq.onsuccess = () => {
          const allPlayers = playersReq.result || [];
          const playerMap = Object.fromEntries(allPlayers.map((p) => [String(p.id), p]));
          const victimIdStr = String(playerId);

          const fieldTeam = allTeams.find(
            (t) =>
              t.status === 'in_field' &&
              (t.players || []).some((pid) => String(pid) === victimIdStr) &&
              (!roundId || t.roundId === roundId)
          );

          if (!fieldTeam) {
            player.status = reason;
            player.joinedAt = joinedAtIsoEndOfQueueExcluding(playerMap, player.id);
            playersStore.put(player);
            finishNoSub();
            return;
          }

          if (!substitute) {
            player.status = reason;
            player.joinedAt = joinedAtIsoEndOfQueueExcluding(playerMap, player.id);
            playersStore.put(player);
            const remaining = (fieldTeam.players || []).filter(
              (pid) => String(pid) !== victimIdStr
            );
            if (remaining.length === 0) teamsStore.delete(fieldTeam.id);
            else teamsStore.put({ ...fieldTeam, players: remaining });
            finishNoSub();
            return;
          }

          if (!roundId) {
            tx.abort();
            reject(new Error('Para substituir em campo, defina a rodada ativa.'));
            return;
          }

          const waitingSorted = sortWaitingTeamsForRound(
            allTeams,
            roundId,
            allPlayers,
            rosterTargetSize
          );
          const nextTeam = waitingSorted[0];

          let subId = null;
          if (nextTeam) {
            const orderedFirst = sortRosterIdsByJoinedAt(nextTeam.players || [], playerMap);
            subId = pickFirstAvailableFromRoster(orderedFirst, playerMap);
            if (!subId) {
              tx.abort();
              reject(
                new Error(
                  'Não há jogador disponível no próximo time da fila para entrar em campo.'
                )
              );
              return;
            }
          } else {
            const onRoster = rosterPlayerIdsSetForRound(allTeams, roundId);
            const freeCandidates = allPlayers
              .filter((p) => canFillWaitingFromBench(p) && !onRoster.has(String(p.id)))
              .sort(sortPlayersByJoinedAtThenId);
            const freePick = freeCandidates[0];
            if (!freePick) {
              tx.abort();
              reject(
                new Error(
                  'Não há time na fila de espera nem jogadores disponíveis fora de elenco. Forme um próximo time ou aguarde jogadores na fila antes de marcar lesão ou cansaço em jogo.'
                )
              );
              return;
            }
            subId = freePick.id;
          }

          const playerIdx = fieldTeam.players.findIndex((pid) => String(pid) === victimIdStr);
          if (playerIdx < 0) {
            tx.abort();
            reject(new Error('Jogador não encontrado no elenco do time em campo.'));
            return;
          }

          let cascadePersist;
          if (nextTeam) {
            try {
              cascadePersist = cascadeWaitingTeamsAfterFieldSubstitution(
                allTeams,
                waitingSorted,
                playerMap,
                allPlayers,
                roundId,
                subId,
                nowIso
              );
            } catch (cascadeErr) {
              tx.abort();
              reject(cascadeErr);
              return;
            }
          } else {
            cascadePersist = new Set();
          }

          const subP = playerMap[String(subId)];
          subP.status = 'in_field';
          playersStore.put(subP);

          for (const sid of cascadePersist) {
            const p = playerMap[sid];
            if (p) playersStore.put(p);
          }

          const updatedFieldPlayers = [...fieldTeam.players];
          updatedFieldPlayers[playerIdx] = subId;
          fieldTeam.players = updatedFieldPlayers;
          teamsStore.put(fieldTeam);

          player.status = reason;
          player.joinedAt = joinedAtIsoEndOfQueueExcluding(playerMap, player.id);
          playersStore.put(player);

          for (const t of waitingSorted) {
            if ((t.players || []).length === 0) {
              teamsStore.delete(t.id);
            } else {
              teamsStore.put(t);
            }
          }

          finishSub();
        };
        playersReq.onerror = () => reject(playersReq.error);
      };
      teamsReq.onerror = () => reject(teamsReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

function detachFromOtherRosters({
  teams,
  playerId,
  exceptTeamId,
  roundId,
  rosterTargetSize,
  playerMap,
  playersStore,
  teamsStore,
}) {
  const id = String(playerId);
  for (const team of teams) {
    if (team.id === exceptTeamId) continue;
    if (roundId && team.roundId !== roundId) continue;
    if (!(team.players || []).some((pid) => String(pid) === id)) continue;
    team.players = team.players.filter((pid) => String(pid) !== id);
    if (team.status === 'waiting' && team.players.length < rosterTargetSize) {
      dissolveWaitingTeamRosterIntoQueue(team, playerMap, playersStore);
      teamsStore.delete(team.id);
    } else if (team.players.length === 0) {
      teamsStore.delete(team.id);
    } else {
      teamsStore.put(team);
    }
  }
}

function writeRosterSwap({
  outgoingId,
  replacementId,
  roundId,
  rosterTargetSize,
  markOutgoingTired,
}) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(['players', 'teams'], 'readwrite');
        const playersStore = tx.objectStore('players');
        const teamsStore = tx.objectStore('teams');
        const fail = (err) => {
          tx.abort();
          reject(err);
        };

        const teamsReq = teamsStore.getAll();
        teamsReq.onerror = () => fail(teamsReq.error);
        teamsReq.onsuccess = () => {
          const playersReq = playersStore.getAll();
          playersReq.onerror = () => fail(playersReq.error);
          playersReq.onsuccess = () => {
            try {
              const teams = teamsReq.result || [];
              const allPlayers = playersReq.result || [];
              const playerMap = Object.fromEntries(allPlayers.map((p) => [String(p.id), p]));
              const outgoing = playerMap[String(outgoingId)];
              const replacement = playerMap[String(replacementId)];
              if (!outgoing || !replacement) throw new Error('Jogador não encontrado.');
              if (String(outgoingId) === String(replacementId)) {
                throw new Error('Escolha outro jogador.');
              }
              if (!canFillWaitingFromBench(replacement)) {
                throw new Error('O jogador escolhido não está disponível.');
              }

              const destination = teams.find(
                (team) =>
                  (!roundId || team.roundId === roundId) &&
                  (team.players || []).some((pid) => String(pid) === String(outgoingId))
              );
              if (!destination) throw new Error('Jogador não está em um time.');
              if (markOutgoingTired && destination.status !== 'in_field') {
                throw new Error('Só um jogador em campo escolhe quem entra.');
              }
              if ((destination.players || []).some((pid) => String(pid) === String(replacementId))) {
                throw new Error('Esse jogador já está neste time.');
              }

              if (!markOutgoingTired) {
                const outgoingJoinedAt = outgoing.joinedAt;
                outgoing.joinedAt = replacement.joinedAt;
                replacement.joinedAt = outgoingJoinedAt;
              } else {
                outgoing.joinedAt = joinedAtIsoEndOfQueueExcluding(playerMap, outgoing.id);
                outgoing.status = 'tired';
              }

              detachFromOtherRosters({
                teams,
                playerId: replacementId,
                exceptTeamId: destination.id,
                roundId,
                rosterTargetSize,
                playerMap,
                playersStore,
                teamsStore,
              });

              destination.players = (destination.players || []).map((pid) =>
                String(pid) === String(outgoingId) ? replacementId : pid
              );
              teamsStore.put(destination);

              if (destination.status === 'in_field') replacement.status = 'in_field';
              if (!markOutgoingTired) outgoing.status = 'available';

              playersStore.put(outgoing);
              playersStore.put(replacement);

              tx.oncomplete = () => {
                notifyChange('player_removed');
                resolve();
              };
            } catch (err) {
              fail(err);
            }
          };
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
      })
  );
}

/** Cansado em campo: o escolhido ocupa a vaga. O cansado não herda a posição dele na fila. */
export function replaceFieldPlayerWith(outgoingId, replacementId, roundId, rosterTargetSize = 5) {
  return writeRosterSwap({
    outgoingId,
    replacementId,
    roundId,
    rosterTargetSize,
    markOutgoingTired: true,
  });
}

/** Sub de escalação errada: troca a vaga e a posição na fila. Quem sai continua disponível. */
export function swapRosterPlayer(outgoingId, replacementId, roundId, rosterTargetSize = 5) {
  return writeRosterSwap({
    outgoingId,
    replacementId,
    roundId,
    rosterTargetSize,
    markOutgoingTired: false,
  });
}

/**
 * Lesionado/cansado → disponível, com joinedAt atual (fim da fila global).
 */
export async function restorePlayerToAvailable(playerId) {
  const db = await openDB();
  const tx = db.transaction('players', 'readwrite');
  const store = tx.objectStore('players');
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const r = store.get(playerId);
    r.onsuccess = () => {
      const p = r.result;
      if (!p) {
        tx.abort();
        reject(new Error('Jogador não encontrado.'));
        return;
      }
      if (!['injured', 'tired'].includes(p.status)) {
        tx.abort();
        reject(new Error('Só é possível liberar jogadores lesionados ou cansados.'));
        return;
      }
      p.status = 'available';
      p.joinedAt = now;
      store.put(p);
    };
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => {
      notifyChange('player_restored');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

// ---------- Partidas ----------

export async function getMatches(roundId = null) {
  const db = await openDB();
  const tx = db.transaction('matches', 'readonly');
  const store = tx.objectStore('matches');
  if (roundId) {
    return new Promise((resolve, reject) => {
      const r = store.index('roundId').getAll(roundId);
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }
  return promisify(store.getAll());
}

export async function getMatchById(matchId) {
  const db = await openDB();
  return promisify(db.transaction('matches', 'readonly').objectStore('matches').get(matchId));
}

export const SCHEDULED_MATCH_TIMER_MIN_MINUTES = 1;
export const SCHEDULED_MATCH_TIMER_MAX_MINUTES = 180;

const DEFAULT_SCHEDULED_MATCH_TIMER_MINUTES = 10;

async function putMatchRow(match) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('matches', 'readwrite');
    tx.objectStore('matches').put(match);
    tx.oncomplete = () => {
      notifyChange('match_timer_updated');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Define duração do cronômetro (minutos) em partida agendada. Não permitido com countdown ativo.
 */
export async function setScheduledMatchTimerDuration(matchId, minutes) {
  const m = Math.round(Number(minutes));
  if (
    !Number.isFinite(m) ||
    m < SCHEDULED_MATCH_TIMER_MIN_MINUTES ||
    m > SCHEDULED_MATCH_TIMER_MAX_MINUTES
  ) {
    throw new Error(
      `Duração deve ser entre ${SCHEDULED_MATCH_TIMER_MIN_MINUTES} e ${SCHEDULED_MATCH_TIMER_MAX_MINUTES} minutos.`
    );
  }
  const match = await getMatchById(matchId);
  if (!match || match.status !== 'scheduled') {
    throw new Error('Partida agendada não encontrada.');
  }
  if (match.countdownEndsAt) {
    throw new Error('Pare o cronômetro (Zerar) para alterar a duração.');
  }
  await putMatchRow({ ...match, timerDurationMinutes: m });
}

/**
 * Inicia contagem regressiva a partir de timerDurationMinutes (padrão 10 se ausente).
 */
export async function startScheduledMatchCountdown(matchId) {
  const match = await getMatchById(matchId);
  if (!match || match.status !== 'scheduled') {
    throw new Error('Partida agendada não encontrada.');
  }
  const minsRaw = match.timerDurationMinutes ?? DEFAULT_SCHEDULED_MATCH_TIMER_MINUTES;
  const mins = Math.round(Number(minsRaw));
  if (
    !Number.isFinite(mins) ||
    mins < SCHEDULED_MATCH_TIMER_MIN_MINUTES ||
    mins > SCHEDULED_MATCH_TIMER_MAX_MINUTES
  ) {
    throw new Error('Defina uma duração válida antes de iniciar.');
  }
  const countdownEndsAt = new Date(Date.now() + mins * 60 * 1000).toISOString();
  await putMatchRow({ ...match, timerDurationMinutes: mins, countdownEndsAt });
}

/** Para o cronômetro sem alterar a duração configurada. */
export async function clearScheduledMatchCountdown(matchId) {
  const match = await getMatchById(matchId);
  if (!match || match.status !== 'scheduled') {
    throw new Error('Partida agendada não encontrada.');
  }
  await putMatchRow({ ...match, countdownEndsAt: null });
}

/** Soma gols + gols contra do adversário em player_stats (placar na lista de partidas). */
export async function getMatchScoresForRound(roundId) {
  const matches = await getMatches(roundId);
  if (!matches.length) return {};
  const db = await openDB();
  const allStats = await promisify(
    db.transaction('player_stats', 'readonly').objectStore('player_stats').getAll()
  );
  const byMatchId = {};
  for (const m of matches) {
    byMatchId[m.id] = { teamA: m.teamA, teamB: m.teamB, scoreA: 0, scoreB: 0 };
  }
  for (const s of allStats || []) {
    if (s.roundId !== roundId) continue;
    const row = byMatchId[s.matchId];
    if (!row) continue;
    const g = Number(s.goals) || 0;
    const og = Number(s.ownGoals) || 0;
    if (s.teamId === row.teamA) {
      row.scoreA += g;
      row.scoreB += og;
    } else if (s.teamId === row.teamB) {
      row.scoreB += g;
      row.scoreA += og;
    }
  }
  return byMatchId;
}

function fifoPreWaitingTeamIds(teams, roundId, players, rosterTargetSize) {
  return sortWaitingTeamsForRound(teams, roundId, players, rosterTargetSize).map((t) => t.id);
}

/** Para UI: quantos times waiting antes de finalizar com empate. */
export async function listPreWaitingTeamIds(roundId, rosterTargetSize = 5) {
  const [teams, players] = await Promise.all([getTeams(roundId), getPlayers()]);
  return fifoPreWaitingTeamIds(teams, roundId, players, rosterTargetSize);
}

function addScheduledMatchInStore(matchesStore, roundId, teamAId, teamBId, timestamp) {
  matchesStore.add({
    id: crypto.randomUUID(),
    roundId,
    teamA: teamAId,
    teamB: teamBId,
    result: null,
    status: 'scheduled',
    draw: false,
    winningTeamId: null,
    timestamp,
    timerDurationMinutes: DEFAULT_SCHEDULED_MATCH_TIMER_MINUTES,
    countdownEndsAt: null,
  });
}

/**
 * Aplica plano de próxima partida (promover times, criar time, agenda).
 */
export async function applyPostMatchSchedule(roundId, finalizedMatch, result, options = {}) {
  const teamSize = options.teamSize ?? 5;
  const preWaitingTeamIds = options.preWaitingTeamIds ?? [];
  const tiebreakerWinnerTeamId = options.tiebreakerWinnerTeamId ?? null;

  const teams = await getTeams(roundId);
  const players = await getPlayers(false);

  const plan = planNextMatch({
    roundId,
    match: finalizedMatch,
    result,
    teams,
    players,
    teamSize,
    preWaitingTeamIds,
    tiebreakerWinnerTeamId,
  });

  if (plan.type === 'none') {
    return plan;
  }

  const db = await openDB();
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['teams', 'players', 'matches'], 'readwrite');
    const teamsStore = tx.objectStore('teams');
    const playersStore = tx.objectStore('players');
    const matchesStore = tx.objectStore('matches');

    const allT = teamsStore.getAll();
    allT.onsuccess = () => {
      const teamList = allT.result || [];
      const allP = playersStore.getAll();
      allP.onsuccess = () => {
        try {
          const playerMap = Object.fromEntries((allP.result || []).map((p) => [p.id, { ...p }]));
          const byTeam = Object.fromEntries(teamList.map((t) => [t.id, { ...t }]));

          if (plan.type === 'schedule') {
            const ta = byTeam[plan.teamAId];
            const tb = byTeam[plan.teamBId];
            if (!ta || !tb) throw new Error('Times do plano automático não encontrados.');
            ta.status = 'in_field';
            tb.status = 'in_field';
            stripWaitingQueueFields(ta);
            stripWaitingQueueFields(tb);
            teamsStore.put(ta);
            teamsStore.put(tb);
            for (const pid of ta.players || []) {
              const p = playerMap[pid];
              if (p) {
                p.status = 'in_field';
                playersStore.put(p);
              }
            }
            for (const pid of tb.players || []) {
              const p = playerMap[pid];
              if (p) {
                p.status = 'in_field';
                playersStore.put(p);
              }
            }
            addScheduledMatchInStore(matchesStore, roundId, plan.teamAId, plan.teamBId, now);
          } else if (plan.type === 'resize_waiting_schedule') {
            const wt = byTeam[plan.waitingTeamId];
            const win = byTeam[plan.winnerId];
            if (!wt || !win) throw new Error('Times não encontrados para remontagem.');
            wt.players = [...plan.mergedPlayerIds];
            wt.status = 'in_field';
            stripWaitingQueueFields(wt);
            teamsStore.put(wt);
            win.status = 'in_field';
            stripWaitingQueueFields(win);
            teamsStore.put(win);
            const mergeStart = nextRequeueSlotMs(playerMap);
            stampJoinedAtStagger(playerMap, plan.mergedPlayerIds, mergeStart);
            for (const pid of wt.players) {
              const p = playerMap[pid];
              if (p) {
                p.status = 'in_field';
                playersStore.put(p);
              }
            }
            addScheduledMatchInStore(matchesStore, roundId, plan.winnerId, plan.waitingTeamId, now);
          } else if (plan.type === 'draw_one_waiting') {
            const w = byTeam[plan.waitingTeamId];
            if (!w) throw new Error('Time waiting não encontrado.');
            const loserTeamId =
              plan.match.teamA === plan.tiebreakerWinnerTeamId
                ? plan.match.teamB
                : plan.match.teamA;
            const wT = byTeam[plan.tiebreakerWinnerTeamId];
            const lT = byTeam[loserTeamId];
            const earlierMs = Date.now() - 3_600_000;
            let slotAfterWinners = stampJoinedAtStagger(playerMap, wT.players || [], earlierMs);
            slotAfterWinners = Math.max(slotAfterWinners, Date.now());
            stampJoinedAtStagger(playerMap, lT.players || [], slotAfterWinners);
            for (const pid of [...(wT.players || []), ...(lT.players || [])]) {
              const p = playerMap[pid];
              if (p) playersStore.put(p);
            }
            const newTeam = {
              id: crypto.randomUUID(),
              roundId,
              players: [...plan.newTeamPlayerIds],
              status: 'in_field',
              isBlocked: false,
              createdAt: now,
            };
            teamsStore.add(newTeam);
            w.status = 'in_field';
            stripWaitingQueueFields(w);
            teamsStore.put(w);
            for (const pid of newTeam.players) {
              const p = playerMap[pid];
              if (p) {
                p.status = 'in_field';
                playersStore.put(p);
              }
            }
            for (const pid of w.players || []) {
              const p = playerMap[pid];
              if (p) {
                p.status = 'in_field';
                playersStore.put(p);
              }
            }
            addScheduledMatchInStore(matchesStore, roundId, w.id, newTeam.id, now);
          } else {
            throw new Error('Plano de pós-partida desconhecido.');
          }

          tx.oncomplete = () => {
            notifyChange('post_match_schedule');
            resolve(plan);
          };
        } catch (err) {
          tx.abort();
          reject(err);
        }
      };
      allP.onerror = () => reject(allP.error);
    };
    allT.onerror = () => reject(allT.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Registra partida finalizada na rodada.
 * Vitória: time perdedor é removido; jogadores voltam à fila (`available`, joinedAt atualizado).
 * Empate: ambos os times são removidos e os jogadores voltam à fila.
 * O time vencedor permanece no store (`in_field`). No empate, nenhum dos dois permanece como time.
 */
export async function recordMatch(roundId, teamAId, teamBId, result) {
  if (!['A_win', 'B_win', 'draw'].includes(result)) {
    throw new Error("Resultado deve ser 'A_win', 'B_win' ou 'draw'.");
  }

  const db = await openDB();
  const tx = db.transaction(['players', 'teams', 'matches'], 'readwrite');
  const playersStore = tx.objectStore('players');
  const teamsStore = tx.objectStore('teams');
  const matchesStore = tx.objectStore('matches');
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const teamAReq = teamsStore.get(teamAId);
    teamAReq.onsuccess = () => {
      const teamA = teamAReq.result;
      if (!teamA || teamA.roundId !== roundId) {
        tx.abort();
        reject(new Error('Time A não encontrado nesta rodada.'));
        return;
      }

      const teamBReq = teamsStore.get(teamBId);
      teamBReq.onsuccess = () => {
        const teamB = teamBReq.result;
        if (!teamB || teamB.roundId !== roundId) {
          tx.abort();
          reject(new Error('Time B não encontrado nesta rodada.'));
          return;
        }

        const allP = playersStore.getAll();
        allP.onsuccess = () => {
          const playerMap = Object.fromEntries(allP.result.map((p) => [p.id, { ...p }]));

          const dissolveTeamToPlayerQueue = (team, startSlotMs) => {
            if (!team) return startSlotMs;
            const nextSlot = rejoinPlayersToQueuePreservingOrder(
              playerMap,
              team.players || [],
              startSlotMs
            );
            teamsStore.delete(team.id);
            return nextSlot;
          };

          let requeueSlot = nextRequeueSlotMs(playerMap);
          if (result === 'A_win') {
            requeueSlot = dissolveTeamToPlayerQueue(teamB, requeueSlot);
          } else if (result === 'B_win') {
            requeueSlot = dissolveTeamToPlayerQueue(teamA, requeueSlot);
          } else {
            requeueSlot = dissolveTeamToPlayerQueue(teamA, requeueSlot);
            requeueSlot = dissolveTeamToPlayerQueue(teamB, requeueSlot);
          }

          for (const p of Object.values(playerMap)) {
            playersStore.put(p);
          }

          const match = enrichMatchRecord({
            id: crypto.randomUUID(),
            roundId,
            teamA: teamAId,
            teamB: teamBId,
            rosterA: [...(teamA.players || [])],
            rosterB: [...(teamB.players || [])],
            result,
            timestamp: now,
            status: 'finalized',
          });
          matchesStore.add(match);

          tx.oncomplete = () => {
            notifyChange('match_recorded');
            resolve(match);
          };
        };
        allP.onerror = () => reject(allP.error);
      };
      teamBReq.onerror = () => reject(teamBReq.error);
    };
    teamAReq.onerror = () => reject(teamAReq.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

/**
 * Agenda partida sem resultado (para editar stats antes de finalizar).
 */
export async function scheduleMatch(roundId, teamAId, teamBId, options = {}) {
  const teamSize = options.teamSize ?? 5;
  const db = await openDB();
  const tx = db.transaction(['teams', 'matches'], 'readwrite');
  const teamsStore = tx.objectStore('teams');
  const matchesStore = tx.objectStore('matches');
  const now = new Date().toISOString();

  const rosterOk = (team) =>
    !teamSize ||
    teamSize < 1 ||
    (team?.players?.length ?? 0) >= teamSize;

  return new Promise((resolve, reject) => {
    const a = teamsStore.get(teamAId);
    a.onsuccess = () => {
      const teamA = a.result;
      const b = teamsStore.get(teamBId);
      b.onsuccess = () => {
        const teamB = b.result;
        if (!teamA || !teamB || teamA.roundId !== roundId || teamB.roundId !== roundId) {
          tx.abort();
          reject(new Error('Times inválidos para a rodada.'));
          return;
        }
        if (!rosterOk(teamA) || !rosterOk(teamB)) {
          tx.abort();
          reject(
            new Error(
              `Cada time precisa de pelo menos ${teamSize} jogador(es) no elenco para agendar.`
            )
          );
          return;
        }
        const match = {
          id: crypto.randomUUID(),
          roundId,
          teamA: teamAId,
          teamB: teamBId,
          result: null,
          status: 'scheduled',
          draw: false,
          winningTeamId: null,
          timestamp: now,
          timerDurationMinutes: DEFAULT_SCHEDULED_MATCH_TIMER_MINUTES,
          countdownEndsAt: null,
        };
        matchesStore.add(match);
        tx.oncomplete = () => {
          notifyChange('match_scheduled');
          resolve(match);
        };
      };
      b.onerror = () => reject(b.error);
    };
    a.onerror = () => reject(a.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Finaliza partida agendada. Mesma regra de `recordMatch` para times: perdedor(es) dissolvido(s)
 * na fila de jogadores; vencedor permanece em campo. Depois roda `applyPostMatchSchedule` se houver plano.
 * @param {object} [options] — { teamSize, tiebreakerWinnerTeamId } — empate com 1 waiting exige desempate.
 */
export async function finalizeMatch(matchId, result, options = {}) {
  if (!['A_win', 'B_win', 'draw'].includes(result)) {
    throw new Error("Resultado deve ser 'A_win', 'B_win' ou 'draw'.");
  }

  const snapshot = await getMatchById(matchId);
  if (!snapshot || snapshot.status !== 'scheduled') {
    throw new Error('Partida agendada não encontrada.');
  }
  const roundId = snapshot.roundId;
  const teamsBefore = await getTeams(roundId);
  const playersBefore = await getPlayers(false);
  const rosterSz = options.teamSize ?? 5;
  const preWaitingTeamIds = fifoPreWaitingTeamIds(
    teamsBefore,
    roundId,
    playersBefore,
    rosterSz
  );
  if (result === 'draw' && preWaitingTeamIds.length === 1 && !options.tiebreakerWinnerTeamId) {
    throw new Error('REQUIRES_TIEBREAKER');
  }

  const db = await openDB();
  const tx = db.transaction(['players', 'teams', 'matches'], 'readwrite');
  const playersStore = tx.objectStore('players');
  const teamsStore = tx.objectStore('teams');
  const matchesStore = tx.objectStore('matches');
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const mReq = matchesStore.get(matchId);
    mReq.onsuccess = () => {
      const match = mReq.result;
      if (!match || match.status !== 'scheduled') {
        tx.abort();
        reject(new Error('Partida agendada não encontrada.'));
        return;
      }

      const teamAReq = teamsStore.get(match.teamA);
      teamAReq.onsuccess = () => {
        const teamA = teamAReq.result;
        const teamBReq = teamsStore.get(match.teamB);
        teamBReq.onsuccess = () => {
          const teamB = teamBReq.result;
          const allP = playersStore.getAll();
          allP.onsuccess = () => {
            const playerMap = Object.fromEntries(allP.result.map((p) => [p.id, { ...p }]));

            const dissolveTeamToPlayerQueue = (team, startSlotMs) => {
              if (!team) return startSlotMs;
              const nextSlot = rejoinPlayersToQueuePreservingOrder(
                playerMap,
                team.players || [],
                startSlotMs
              );
              teamsStore.delete(team.id);
              return nextSlot;
            };

            const rosterA = [...(teamA.players || [])];
            const rosterB = [...(teamB.players || [])];

            let requeueSlot = nextRequeueSlotMs(playerMap);
            if (result === 'A_win') {
              requeueSlot = dissolveTeamToPlayerQueue(teamB, requeueSlot);
            } else if (result === 'B_win') {
              requeueSlot = dissolveTeamToPlayerQueue(teamA, requeueSlot);
            } else {
              requeueSlot = dissolveTeamToPlayerQueue(teamA, requeueSlot);
              requeueSlot = dissolveTeamToPlayerQueue(teamB, requeueSlot);
            }

            for (const p of Object.values(playerMap)) {
              playersStore.put(p);
            }

            match.result = result;
            match.status = 'finalized';
            match.rosterA = rosterA;
            match.rosterB = rosterB;
            Object.assign(match, enrichMatchRecord(match));
            match.timestamp = now;
            matchesStore.put(match);

            tx.oncomplete = () => {
              notifyChange('match_finalized');
              applyPostMatchSchedule(roundId, match, result, {
                teamSize: rosterSz,
                preWaitingTeamIds,
                tiebreakerWinnerTeamId: options.tiebreakerWinnerTeamId ?? null,
              })
                .then(() => resolve(match))
                .catch(reject);
            };
          };
          allP.onerror = () => reject(allP.error);
        };
        teamBReq.onerror = () => reject(teamBReq.error);
      };
      teamAReq.onerror = () => reject(teamAReq.error);
    };
    mReq.onerror = () => reject(mReq.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

function rosterOkForSchedule(team, teamSize) {
  return !teamSize || teamSize < 1 || (team?.players?.length ?? 0) >= teamSize;
}

function deletePlayerStatsByMatchCursor(statsStore, matchId, onDone, onError) {
  const clearReq = statsStore.index('matchId').openCursor(matchId);
  clearReq.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    } else {
      onDone();
    }
  };
  clearReq.onerror = () => onError(clearReq.error);
}

/**
 * Troca os times de uma partida agendada. Remove stats rascunho dessa partida.
 */
export async function updateScheduledMatchTeams(matchId, teamAId, teamBId, options = {}) {
  const teamSize = options.teamSize ?? 5;
  if (teamAId === teamBId) {
    throw new Error('Os dois times da partida devem ser diferentes.');
  }
  const db = await openDB();
  const tx = db.transaction(['matches', 'teams', 'player_stats'], 'readwrite');
  const matchesStore = tx.objectStore('matches');
  const teamsStore = tx.objectStore('teams');
  const statsStore = tx.objectStore('player_stats');

  return new Promise((resolve, reject) => {
    const mReq = matchesStore.get(matchId);
    mReq.onsuccess = () => {
      const match = mReq.result;
      if (!match || match.status !== 'scheduled') {
        tx.abort();
        reject(new Error('Partida agendada não encontrada.'));
        return;
      }
      const roundId = match.roundId;
      const a = teamsStore.get(teamAId);
      a.onsuccess = () => {
        const teamA = a.result;
        const b = teamsStore.get(teamBId);
        b.onsuccess = () => {
          const teamB = b.result;
          if (
            !teamA ||
            !teamB ||
            teamA.roundId !== roundId ||
            teamB.roundId !== roundId
          ) {
            tx.abort();
            reject(new Error('Times inválidos para a rodada.'));
            return;
          }
          if (!rosterOkForSchedule(teamA, teamSize) || !rosterOkForSchedule(teamB, teamSize)) {
            tx.abort();
            reject(
              new Error(
                `Cada time precisa de pelo menos ${teamSize} jogador(es) no elenco para a partida.`
              )
            );
            return;
          }
          match.teamA = teamAId;
          match.teamB = teamBId;
          matchesStore.put(match);
          deletePlayerStatsByMatchCursor(
            statsStore,
            matchId,
            () => {
              tx.oncomplete = () => {
                notifyChange('match_updated');
                resolve(match);
              };
            },
            reject
          );
        };
        b.onerror = () => reject(b.error);
      };
      a.onerror = () => reject(a.error);
    };
    mReq.onerror = () => reject(mReq.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

/**
 * Remove partida (agendada ou finalizada) e stats em player_stats dessa partida.
 */
export async function deleteMatch(matchId) {
  const db = await openDB();
  const tx = db.transaction(['matches', 'player_stats'], 'readwrite');
  const matchesStore = tx.objectStore('matches');
  const statsStore = tx.objectStore('player_stats');

  return new Promise((resolve, reject) => {
    const mReq = matchesStore.get(matchId);
    mReq.onsuccess = () => {
      const match = mReq.result;
      if (!match) {
        tx.abort();
        reject(new Error('Partida não encontrada.'));
        return;
      }
      matchesStore.delete(matchId);
      deletePlayerStatsByMatchCursor(
        statsStore,
        matchId,
        () => {
          tx.oncomplete = () => {
            notifyChange('match_deleted');
            resolve();
          };
        },
        reject
      );
    };
    mReq.onerror = () => reject(mReq.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada.'));
  });
}

/**
 * Remove uma partida agendada e as stats associadas em player_stats.
 */
export async function cancelScheduledMatch(matchId) {
  const match = await getMatchById(matchId);
  if (!match || match.status !== 'scheduled') {
    throw new Error('Partida agendada não encontrada.');
  }
  return deleteMatch(matchId);
}

// ---------- Stats por partida ----------

export async function listPlayerStatsForMatch(matchId) {
  const db = await openDB();
  const tx = db.transaction('player_stats', 'readonly');
  const idx = tx.objectStore('player_stats').index('matchId');
  return new Promise((resolve, reject) => {
    const r = idx.getAll(matchId);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Substitui todas as stats de uma partida (transação única + validação).
 * payload: { playerId, teamId, goals, assists, ownGoals, wasGoalkeeper? } (GK omitido na UI; default false)
 */
export async function bulkUpsertPlayerStats(matchId, roundId, payload) {
  const db = await openDB();
  const tx = db.transaction(['matches', 'teams', 'player_stats', 'players'], 'readwrite');
  const matchesStore = tx.objectStore('matches');
  const teamsStore = tx.objectStore('teams');
  const statsStore = tx.objectStore('player_stats');
  const playersStore = tx.objectStore('players');

  return new Promise((resolve, reject) => {
    const mReq = matchesStore.get(matchId);
    mReq.onsuccess = () => {
      const match = mReq.result;
      if (!match || match.roundId !== roundId) {
        tx.abort();
        reject(new Error('Partida não encontrada nesta rodada.'));
        return;
      }

      const tA = teamsStore.get(match.teamA);
      tA.onsuccess = () => {
        const teamA = tA.result;
        const tB = teamsStore.get(match.teamB);
        tB.onsuccess = () => {
          const teamB = tB.result;
          const teamsAllReq = teamsStore.getAll();
          teamsAllReq.onsuccess = () => {
            const roundTeams = (teamsAllReq.result || []).filter((t) => t.roundId === match.roundId);
            const playersReq = playersStore.getAll();
            playersReq.onsuccess = () => {
              const allPlayers = playersReq.result || [];
              const idsAFromTeam = teamA?.players?.length
                ? [...teamA.players]
                : [...(match.rosterA || [])];
              const idsBFromTeam = teamB?.players?.length
                ? [...teamB.players]
                : [...(match.rosterB || [])];

              const lines = payload.map((row) => ({
                playerId: row.playerId,
                teamId: row.teamId,
                matchId,
                goals: Number(row.goals) || 0,
                assists: Number(row.assists) || 0,
                ownGoals: Number(row.ownGoals) || 0,
                wasGoalkeeper: Boolean(row.wasGoalkeeper),
              }));

              const fieldLinesOnly = lines.filter((l) => !l.wasGoalkeeper);
              const gkLines = lines.filter((l) => l.wasGoalkeeper);

              let idsA =
                idsAFromTeam.length > 0
                  ? idsAFromTeam
                  : [
                      ...new Set(
                        fieldLinesOnly
                          .filter((l) => l.teamId === match.teamA)
                          .map((l) => l.playerId)
                      ),
                    ];
              let idsB =
                idsBFromTeam.length > 0
                  ? idsBFromTeam
                  : [
                      ...new Set(
                        fieldLinesOnly
                          .filter((l) => l.teamId === match.teamB)
                          .map((l) => l.playerId)
                      ),
                    ];

              const { idsA: rosterA, idsB: rosterB } = getFieldRosterIds(match, teamA, teamB);

              const allowedField = new Set([...idsA, ...idsB]);

              const rosterHasFieldPlayer = (teamId, playerId) => {
                const roster = teamId === match.teamA ? idsA : idsB;
                return roster.includes(playerId);
              };

              for (const line of fieldLinesOnly) {
                if (!allowedField.has(line.playerId)) {
                  tx.abort();
                  reject(new Error(`Jogador ${line.playerId} não está nos times da partida.`));
                  return;
                }
                if (line.teamId !== match.teamA && line.teamId !== match.teamB) {
                  tx.abort();
                  reject(new Error('teamId deve ser um dos times da partida.'));
                  return;
                }
                if (!rosterHasFieldPlayer(line.teamId, line.playerId)) {
                  tx.abort();
                  reject(new Error('Jogador não pertence ao time indicado.'));
                  return;
                }
              }

              for (const line of gkLines) {
                if (line.teamId !== match.teamA && line.teamId !== match.teamB) {
                  tx.abort();
                  reject(new Error('teamId deve ser um dos times da partida.'));
                  return;
                }
                if (isOnFieldRosterForTeam(line.playerId, line.teamId, match, rosterA, rosterB)) {
                  tx.abort();
                  reject(
                    new Error(
                      'Goleiro externo não pode estar no elenco de campo do time que defende.'
                    )
                  );
                  return;
                }
                if (isOnEitherFieldRoster(line.playerId, rosterA, rosterB)) {
                  tx.abort();
                  reject(new Error('Goleiro externo não pode estar no elenco de campo da partida.'));
                  return;
                }
                if (!isEligibleExternalGoalkeeper(line.playerId, match, roundTeams, allPlayers)) {
                  tx.abort();
                  reject(
                    new Error(
                      'Goleiro deve estar disponível ou em um time de espera (fora desta partida).'
                    )
                  );
                  return;
                }
              }

              const valErrors = validateMatchPlayerStats(lines);
              if (valErrors.length) {
                tx.abort();
                reject(new Error(valErrors.join(' ')));
                return;
              }

              const clearReq = statsStore.index('matchId').openCursor(matchId);
              clearReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                  cursor.delete();
                  cursor.continue();
                } else {
                  for (const line of lines) {
                    const id = `${matchId}-${line.teamId}-${line.playerId}`;
                    statsStore.put({
                      id,
                      roundId,
                      matchId,
                      teamId: line.teamId,
                      playerId: line.playerId,
                      goals: line.goals,
                      assists: line.assists,
                      ownGoals: line.ownGoals,
                      wasGoalkeeper: line.wasGoalkeeper,
                    });
                  }
                  tx.oncomplete = () => {
                    notifyChange('player_stats_updated');
                    resolve();
                  };
                }
              };
            };
            playersReq.onerror = () => reject(playersReq.error);
          };
          teamsAllReq.onerror = () => reject(teamsAllReq.error);
        };
        tB.onerror = () => reject(tB.error);
      };
      tA.onerror = () => reject(tA.error);
    };
    mReq.onerror = () => reject(mReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Estatísticas da rodada ----------

export async function getRoundStatistics(roundId) {
  const matches = await getMatches(roundId);
  const finalized = matches.filter((m) => m.status === 'finalized' && m.result);
  const db = await openDB();
  const tx = db.transaction(['player_stats', 'players'], 'readonly');
  const allStats = await promisify(tx.objectStore('player_stats').getAll());
  const players = await promisify(tx.objectStore('players').getAll());
  const teams = await getTeams(roundId);
  const playerIdsInRound = new Set();
  for (const t of teams) {
    for (const pid of t.players || []) playerIdsInRound.add(pid);
  }
  const statsForRound = (allStats || []).filter((s) => s.roundId === roundId);
  return aggregatePlayerStatistics({
    players,
    statsRows: statsForRound,
    finalizedMatches: finalized,
    seedPlayerIds: playerIdsInRound,
  });
}

function aggregatePlayerStatistics({ players, statsRows, finalizedMatches, seedPlayerIds = null }) {
  const playerById = Object.fromEntries((players || []).map((p) => [p.id, p]));
  const byPlayer = {};

  function ensurePlayerRow(pid) {
    if (!byPlayer[pid]) {
      byPlayer[pid] = {
        playerId: pid,
        name: playerById[pid]?.name || pid,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        matches: new Set(),
        goalkeeperMatches: new Set(),
        wins: 0,
        losses: 0,
        draws: 0,
      };
    }
    return byPlayer[pid];
  }

  if (seedPlayerIds) {
    for (const pid of seedPlayerIds) ensurePlayerRow(pid);
  } else {
    for (const p of players || []) ensurePlayerRow(p.id);
  }

  const finalizedById = new Map((finalizedMatches || []).map((m) => [m.id, m]));
  const statsByMatch = {};
  for (const s of statsRows || []) {
    if (!finalizedById.has(s.matchId)) continue;
    const row = ensurePlayerRow(s.playerId);
    row.goals += Number(s.goals) || 0;
    row.assists += Number(s.assists) || 0;
    row.ownGoals += Number(s.ownGoals) || 0;
    row.matches.add(s.matchId);
    if (s.wasGoalkeeper) row.goalkeeperMatches.add(s.matchId);
    if (!statsByMatch[s.matchId]) statsByMatch[s.matchId] = [];
    statsByMatch[s.matchId].push(s);
  }

  for (const m of finalizedMatches || []) {
    const matchStats = statsByMatch[m.id] || [];
    const seen = new Set();
    for (const s of matchStats) {
      if (seen.has(s.playerId)) continue;
      seen.add(s.playerId);
      const row = ensurePlayerRow(s.playerId);
      if (m.draw) row.draws += 1;
      else if (m.winningTeamId === s.teamId) row.wins += 1;
      else row.losses += 1;
    }
  }

  return Object.values(byPlayer).map((row) => ({
    ...row,
    matches: row.matches.size,
    goalkeeperMatches: row.goalkeeperMatches.size,
  }));
}

export async function getGlobalPlayerStatistics() {
  const matches = await getMatches();
  const finalized = matches.filter((m) => m.status === 'finalized' && m.result);
  const db = await openDB();
  const tx = db.transaction(['player_stats', 'players'], 'readonly');
  const allStats = await promisify(tx.objectStore('player_stats').getAll());
  const players = await promisify(tx.objectStore('players').getAll());
  return aggregatePlayerStatistics({
    players,
    statsRows: allStats || [],
    finalizedMatches: finalized,
  });
}

// ---------- Próxima partida ----------

export async function suggestNextMatchForRound(roundId, teamSize = 5) {
  const teams = await getTeams(roundId);
  const matches = await getMatches(roundId);
  const finalized = matches
    .filter((m) => m.status === 'finalized' && m.result)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return computeSuggestNextMatch(teams, finalized, teamSize);
}

// ---------- Estatísticas globais (legado) ----------

export async function recordGoal(playerId) {
  const db = await openDB();
  const tx = db.transaction('players', 'readwrite');
  const store = tx.objectStore('players');

  return new Promise((resolve, reject) => {
    const getReq = store.get(playerId);
    getReq.onsuccess = () => {
      const player = getReq.result;
      if (!player) {
        tx.abort();
        reject(new Error('Jogador não encontrado.'));
        return;
      }
      player.goals = (player.goals || 0) + 1;
      store.put(player);
    };
    tx.oncomplete = () => {
      notifyChange('player_goal');
      openDB().then((db2) => {
        const tx2 = db2.transaction('players', 'readonly');
        const r = tx2.objectStore('players').get(playerId);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      });
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeGoal(playerId) {
  const db = await openDB();
  const tx = db.transaction('players', 'readwrite');
  const store = tx.objectStore('players');
  return new Promise((resolve, reject) => {
    store.get(playerId).onsuccess = (e) => {
      const player = e.target.result;
      if (!player) {
        tx.abort();
        reject(new Error('Jogador não encontrado.'));
        return;
      }
      player.goals = Math.max(0, (player.goals || 0) - 1);
      store.put(player);
    };
    tx.oncomplete = () => {
      notifyChange('player_goal_removed');
      openDB().then((db2) => {
        const r = db2.transaction('players', 'readonly').objectStore('players').get(playerId);
        r.onsuccess = () => resolve(r.result);
      });
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function recordAssist(playerId) {
  const db = await openDB();
  const tx = db.transaction('players', 'readwrite');
  const store = tx.objectStore('players');
  return new Promise((resolve, reject) => {
    store.get(playerId).onsuccess = (e) => {
      const player = e.target.result;
      if (!player) {
        tx.abort();
        reject(new Error('Jogador não encontrado.'));
        return;
      }
      player.assists = (player.assists || 0) + 1;
      store.put(player);
    };
    tx.oncomplete = () => {
      notifyChange('player_assist');
      openDB().then((db2) => {
        const r = db2.transaction('players', 'readonly').objectStore('players').get(playerId);
        r.onsuccess = () => resolve(r.result);
      });
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeAssist(playerId) {
  const db = await openDB();
  const tx = db.transaction('players', 'readwrite');
  const store = tx.objectStore('players');
  return new Promise((resolve, reject) => {
    store.get(playerId).onsuccess = (e) => {
      const player = e.target.result;
      if (!player) {
        tx.abort();
        reject(new Error('Jogador não encontrado.'));
        return;
      }
      player.assists = Math.max(0, (player.assists || 0) - 1);
      store.put(player);
    };
    tx.oncomplete = () => {
      notifyChange('player_assist_removed');
      openDB().then((db2) => {
        const r = db2.transaction('players', 'readonly').objectStore('players').get(playerId);
        r.onsuccess = () => resolve(r.result);
      });
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPlayerStats() {
  const players = await getPlayers(false);
  return players.map((p) => ({
    ...p,
    goals: p.goals || 0,
    assists: p.assists || 0,
    preferGoalkeeper: Boolean(p.preferGoalkeeper),
    goalkeeperOnly: Boolean(p.goalkeeperOnly),
  }));
}

export async function runDatastoreMaintenance() {
  const db = await openDB();
  const readTx = db.transaction(['players', 'teams', 'matches', 'rounds', 'player_stats'], 'readonly');
  const players = await promisify(readTx.objectStore('players').getAll());
  const teams = await promisify(readTx.objectStore('teams').getAll());
  const matches = await promisify(readTx.objectStore('matches').getAll());
  const rounds = await promisify(readTx.objectStore('rounds').getAll());
  const stats = await promisify(readTx.objectStore('player_stats').getAll());

  const matchIds = new Set((matches || []).map((m) => m.id));
  const roundIds = new Set((rounds || []).map((r) => r.id));

  const orphanStatIds = [];
  for (const row of stats || []) {
    if (!matchIds.has(row.matchId) || !roundIds.has(row.roundId)) {
      orphanStatIds.push(row.id);
    }
  }

  const playerIdStrSet = new Set((players || []).map((p) => String(p.id)));
  const playerByIdMaint = Object.fromEntries((players || []).map((p) => [String(p.id), p]));

  const cleanedTeams = [];
  let scrubbedTeamPlayerSlots = 0;
  for (const team of teams || []) {
    const orig = team.players || [];
    const next = orig.filter((pid) => {
      if (!playerIdStrSet.has(String(pid))) return false;
      const p = playerByIdMaint[String(pid)];
      if (!p) return false;
      if (team.status === 'waiting') {
        return isStatusAvailable(p.status) && !isGoalkeeperOnlyPlayer(p);
      }
      if (team.status === 'in_field') {
        return p.status === 'in_field';
      }
      return true;
    });
    if (next.length !== orig.length) {
      scrubbedTeamPlayerSlots += orig.length - next.length;
      cleanedTeams.push({ ...team, players: next });
    }
  }

  const teamById = new Map((teams || []).map((t) => [t.id, { ...t }]));
  for (const c of cleanedTeams) {
    if ((c.players || []).length === 0) teamById.delete(c.id);
    else teamById.set(c.id, c);
  }
  const onRoster = new Set();
  for (const t of teamById.values()) {
    for (const pid of t.players || []) {
      onRoster.add(String(pid));
    }
  }
  const staleInFieldIds = (players || [])
    .filter((p) => p.status === 'in_field' && !onRoster.has(String(p.id)))
    .sort(sortPlayersByJoinedAtThenId)
    .map((p) => p.id);

  if (!orphanStatIds.length && !cleanedTeams.length && !staleInFieldIds.length) {
    return {
      removedStats: 0,
      scrubbedTeamPlayerSlots: 0,
      teamsUpdated: 0,
      requeuedGhostInField: 0,
    };
  }

  const writeTx = db.transaction(['player_stats', 'teams', 'players'], 'readwrite');
  const statsStore = writeTx.objectStore('player_stats');
  const teamsStore = writeTx.objectStore('teams');
  const playersStore = writeTx.objectStore('players');
  for (const statId of orphanStatIds) statsStore.delete(statId);
  for (const team of cleanedTeams) {
    if ((team.players || []).length === 0) teamsStore.delete(team.id);
    else teamsStore.put(team);
  }

  return new Promise((resolve, reject) => {
    const finish = () => {
      writeTx.oncomplete = () => {
        notifyChange('datastore_maintenance');
        resolve({
          removedStats: orphanStatIds.length,
          scrubbedTeamPlayerSlots,
          teamsUpdated: cleanedTeams.length,
          requeuedGhostInField: staleInFieldIds.length,
        });
      };
      writeTx.onerror = () => reject(writeTx.error);
    };

    if (!staleInFieldIds.length) {
      finish();
      return;
    }

    const pAll = playersStore.getAll();
    pAll.onsuccess = () => {
      const raw = pAll.result || [];
      const playerMap = Object.fromEntries(raw.map((p) => [p.id, { ...p }]));
      const startSlot = nextRequeueSlotMs(playerMap);
      rejoinPlayersToQueuePreservingOrder(playerMap, staleInFieldIds, startSlot);
      for (const pid of staleInFieldIds) {
        const p = playerMap[pid];
        if (p) playersStore.put(p);
      }
      finish();
    };
    pAll.onerror = () => reject(pAll.error);
  });
}

// ---------- Export / Import ----------

export async function exportData() {
  const db = await openDB();
  const tx = db.transaction(
    ['players', 'teams', 'matches', 'rounds', 'meta', 'player_stats'],
    'readonly'
  );
  const players = await promisify(tx.objectStore('players').getAll());
  const teams = await promisify(tx.objectStore('teams').getAll());
  const matches = await promisify(tx.objectStore('matches').getAll());
  const rounds = await promisify(tx.objectStore('rounds').getAll());
  const meta = await promisify(tx.objectStore('meta').getAll());
  const player_stats = await promisify(tx.objectStore('player_stats').getAll());
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    players,
    teams,
    matches,
    rounds,
    meta,
    player_stats,
    exportedAt: new Date().toISOString(),
  };
}

export async function importData(json) {
  if (!json || !json.players || !json.teams || !json.matches) {
    throw new Error('JSON inválido. Deve conter players, teams e matches.');
  }

  const hasRounds = Array.isArray(json.rounds) && json.rounds.length > 0;
  const metaRows = json.meta || [];
  const statsRows = json.player_stats || [];

  const db = await openDB();
  const stores = ['players', 'teams', 'matches', 'rounds', 'meta', 'player_stats'];
  const tx = db.transaction(stores, 'readwrite');

  for (const name of stores) {
    tx.objectStore(name).clear();
  }

  for (const player of json.players) {
    tx.objectStore('players').add({
      ...player,
      preferGoalkeeper: Boolean(player.preferGoalkeeper || player.goalkeeperOnly),
      goalkeeperOnly: Boolean(player.goalkeeperOnly),
    });
  }

  if (hasRounds) {
    for (const r of json.rounds) {
      tx.objectStore('rounds').add(r);
    }
    for (const team of json.teams) {
      tx.objectStore('teams').add(team);
    }
    for (const match of json.matches) {
      tx.objectStore('matches').add(match);
    }
  } else {
    const roundId = crypto.randomUUID();
    const ts = Date.now();
    const now = new Date(ts).toISOString();
    tx.objectStore('rounds').add({
      id: roundId,
      name: `Rodada ${new Date(ts).toLocaleString('pt-BR')}`,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    });
    tx.objectStore('meta').put({ key: 'activeRoundId', value: roundId });
    for (const team of json.teams) {
      tx.objectStore('teams').add({
        ...team,
        roundId,
        isBlocked: team.isBlocked ?? false,
      });
    }
    for (const match of json.matches) {
      tx.objectStore('matches').add({
        ...match,
        roundId,
        status: match.status || 'finalized',
      });
    }
  }

  for (const row of metaRows) {
    tx.objectStore('meta').put(row);
  }
  for (const row of statsRows) {
    tx.objectStore('player_stats').put(row);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      notifyChange('data_imported');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function onChange(callback) {
  if (!broadcastChannel) {
    return () => {};
  }
  const handler = (event) => {
    callback(event.data);
  };
  broadcastChannel.addEventListener('message', handler);
  return () => {
    broadcastChannel.removeEventListener('message', handler);
  };
}

export async function deleteDatabase() {
  closeDB();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
