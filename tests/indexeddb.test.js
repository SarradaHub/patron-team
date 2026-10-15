/**
 * Testes unitários para a camada IndexedDB.
 *
 * Cobre as operações críticas:
 *   - addPlayer e getPlayers
 *   - formTeam (FIFO e atomicidade)
 *   - removePlayer (com e sem substituição)
 *   - finalizeMatch (vitória, derrota, empate)
 *   - exportData e importData
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  openDB,
  closeDB,
  addPlayer,
  getPlayers,
  updatePlayerName,
  updatePlayerProfile,
  updateTeamDisplayName,
  updateTeamRoster,
  formTeam,
  formAllTeamsPossible,
  removePlayer,
  replaceFieldPlayerWith,
  swapRosterPlayer,
  restorePlayerToAvailable,
  getTeams,
  getMatches,
  scheduleMatch,
  updateScheduledMatchTeams,
  cancelScheduledMatch,
  deleteMatch,
  deletePlayerPermanently,
  deleteTeam,
  bulkUpsertPlayerStats,
  listPlayerStatsForMatch,
  getMatchScoresForRound,
  exportData,
  importData,
  deleteDatabase,
  ensureDefaultActiveRound,
  getActiveRoundId,
  getRound,
  updateRoundName,
  finalizeMatch,
  getRoundStatistics,
  getGlobalPlayerStatistics,
  runDatastoreMaintenance,
  rebalanceTeams,
  toggleTeamBlocked,
} from '../src/api/indexeddb.js';

async function testRoundId() {
  await ensureDefaultActiveRound();
  return getActiveRoundId();
}

async function setTeamStatus(teamId, status) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('teams', 'readwrite');
    const store = tx.objectStore('teams');
    const req = store.get(teamId);
    req.onsuccess = () => {
      const team = req.result;
      team.status = status;
      store.put(team);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Limpa o banco antes de cada teste para isolamento
beforeEach(async () => {
  await deleteDatabase();
});

describe('addPlayer e getPlayers', () => {
  it('deve adicionar um jogador com status available', async () => {
    const player = await addPlayer('Carlos');
    expect(player).toBeDefined();
    expect(player.name).toBe('Carlos');
    expect(player.status).toBe('available');
    expect(player.id).toBeDefined();
    expect(player.joinedAt).toBeDefined();
  });

  it('deve rejeitar nome vazio', async () => {
    await expect(addPlayer('')).rejects.toThrow('Nome do jogador é obrigatório.');
  });

  it('deve listar jogadores na ordem FIFO (joinedAt ascendente)', async () => {
    await addPlayer('Alice');
    // Pequeno delay para garantir timestamps diferentes
    await new Promise((r) => setTimeout(r, 10));
    await addPlayer('Bruno');
    await new Promise((r) => setTimeout(r, 10));
    await addPlayer('Carla');

    const players = await getPlayers(true);
    expect(players).toHaveLength(3);
    expect(players[0].name).toBe('Alice');
    expect(players[1].name).toBe('Bruno');
    expect(players[2].name).toBe('Carla');
  });

  it('dois adds sobrepostos mantêm o primeiro à frente do segundo na fila', async () => {
    await openDB();
    const now = Date.parse('2026-10-15T15:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const firstAdd = addPlayer('Ana');
      const secondAdd = addPlayer('Bruno');
      const [first, second] = await Promise.all([firstAdd, secondAdd]);

      const players = await getPlayers(true);
      expect(players.map((p) => p.name)).toEqual(['Ana', 'Bruno']);
      expect(Date.parse(first.joinedAt)).toBe(now);
      expect(Date.parse(second.joinedAt)).toBe(now + 1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('removePlayer sem roundId remove jogador dos elencos (evita lesionado ainda no time)', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 9; i += 1) {
      await addPlayer(`Nr${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    await formTeam(3, rid);
    await formTeam(3, rid);
    await formTeam(3, rid);
    const waiting = (await getTeams(rid)).find((t) => t.status === 'waiting');
    expect(waiting).toBeDefined();
    const vid = waiting.players[0];
    await removePlayer(vid, 'injured', false, null, 3);
    const teams = await getTeams(rid);
    expect(teams.every((t) => !(t.players || []).includes(vid))).toBe(true);
    expect((await getPlayers()).find((p) => p.id === vid).status).toBe('injured');
  });

  it('deve atualizar perfil do jogador com flag de goleiro', async () => {
    const player = await addPlayer('Goleiro');
    await updatePlayerProfile(player.id, { name: 'Goleiro 1', preferGoalkeeper: true });
    const players = await getPlayers();
    const updated = players.find((p) => p.id === player.id);
    expect(updated.name).toBe('Goleiro 1');
    expect(updated.preferGoalkeeper).toBe(true);
    expect(updated.goalkeeperOnly).toBeFalsy();
  });

  it('addPlayer com só goleiro não entra na formação automática', async () => {
    const rid = await testRoundId();
    const gk = await addPlayer('Só GK', { goalkeeperOnly: true });
    for (let i = 1; i <= 5; i += 1) {
      await addPlayer(`L${i}`);
      await new Promise((r) => setTimeout(r, 3));
    }
    const team = await formTeam(5, rid);
    expect(team.players).toHaveLength(5);
    expect(team.players).not.toContain(gk.id);
  });
});

describe('formTeam', () => {
  it('deve formar um time com os N primeiros jogadores disponíveis (FIFO)', async () => {
    const rid = await testRoundId();
    await addPlayer('J1');
    await new Promise((r) => setTimeout(r, 10));
    await addPlayer('J2');
    await new Promise((r) => setTimeout(r, 10));
    await addPlayer('J3');
    await new Promise((r) => setTimeout(r, 10));
    await addPlayer('J4');
    await new Promise((r) => setTimeout(r, 10));
    await addPlayer('J5');

    const team = await formTeam(3, rid);
    expect(team).toBeDefined();
    expect(team.players).toHaveLength(3);
    expect(team.status).toBe('in_field');

    // Verifica que os jogadores selecionados estão em campo
    const players = await getPlayers();
    const inField = players.filter((p) => p.status === 'in_field');
    expect(inField).toHaveLength(3);

    // Verifica FIFO: os 3 primeiros devem ser os selecionados
    const available = players.filter((p) => p.status === 'available');
    expect(available).toHaveLength(2);
  });

  it('deve rejeitar quando há menos disponíveis que o limite do time', async () => {
    const rid = await testRoundId();
    await addPlayer('J1');
    await addPlayer('J2');

    await expect(formTeam(5, rid)).rejects.toThrow(
      'Jogadores insuficientes para formar um time de 5. Necessário: 5, disponível: 2.'
    );

    const teams = await getTeams(rid);
    expect(teams.filter((t) => t.roundId === rid)).toHaveLength(0);
  });

  it('deve rejeitar se não há nenhum jogador disponível', async () => {
    const rid = await testRoundId();
    await expect(formTeam(5, rid)).rejects.toThrow('Nenhum jogador disponível');
  });

  it('deve rejeitar tamanho inválido', async () => {
    const rid = await testRoundId();
    await expect(formTeam(0, rid)).rejects.toThrow('Tamanho do time inválido');
  });

  it('formTeam recusa tamanho acima de 20 e não cria time', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 21; i += 1) {
      await addPlayer(`Big${i}`);
    }

    await expect(formTeam(21, rid)).rejects.toThrow('Tamanho do time inválido');
    expect(await getTeams(rid)).toHaveLength(0);
  });

  it('formTeam recusa tamanho quebrado e não cria time', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 5; i += 1) {
      await addPlayer(`Frac${i}`);
    }

    await expect(formTeam(1.5, rid)).rejects.toThrow('Tamanho do time inválido');
    expect(await getTeams(rid)).toHaveLength(0);
  });

  it('completa o time com fila + jogadores do time waiting (perdedor) até o size', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 10; i += 1) {
      await addPlayer(`P${i}`);
      await new Promise((r) => setTimeout(r, 3));
    }
    const teamA = await formTeam(5, rid);
    const teamB = await formTeam(5, rid);
    const finished = await scheduleMatch(rid, teamA.id, teamB.id, { teamSize: 5 });
    await finalizeMatch(finished.id, 'A_win', { teamSize: 5 });

    await addPlayer('N1');
    await new Promise((r) => setTimeout(r, 3));
    await addPlayer('N2');

    const teamNew = await formTeam(5, rid);
    expect(teamNew.players).toHaveLength(5);
    expect(new Set(teamNew.players)).toEqual(new Set(teamB.players));

    const teamsAfter = await getTeams(rid);
    expect(teamsAfter.find((t) => t.id === teamB.id)).toBeUndefined();

    const nIds = new Set(
      (await getPlayers()).filter((p) => p.name === 'N1' || p.name === 'N2').map((p) => p.id)
    );
    const tookN = teamNew.players.filter((id) => nIds.has(id));
    expect(tookN).toHaveLength(0);
  });

  it('FIFO global: prioriza joinedAt mesmo quando o jogador está só em time waiting', async () => {
    const rid = await testRoundId();
    for (const n of ['A', 'B', 'C', 'D', 'Olivia', 'Mafra']) {
      await addPlayer(n);
      await new Promise((r) => setTimeout(r, 5));
    }
    const players = await getPlayers();
    const byName = Object.fromEntries(players.map((p) => [p.name, p]));
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['teams'], 'readwrite');
      tx.objectStore('teams').add({
        id: crypto.randomUUID(),
        roundId: rid,
        players: [byName.Olivia.id],
        status: 'waiting',
        isBlocked: false,
        createdAt: new Date().toISOString(),
        enteredWaitingAt: new Date().toISOString(),
        waitingOrder: 1,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const teamNew = await formTeam(5, rid);
    const expectFirstFive = ['A', 'B', 'C', 'D', 'Olivia'].map((n) => byName[n].id);
    expect(teamNew.players).toEqual(expectFirstFive);
    expect(teamNew.players).not.toContain(byName.Mafra.id);
  });

  it('com 2 em campo + 1 waiting completo, próximo formTeam forma segundo waiting sem repetir elenco', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 21; i += 1) {
      await addPlayer(`P${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    await formTeam(5, rid);
    await formTeam(5, rid);
    const w1 = await formTeam(5, rid);
    expect(w1.status).toBe('waiting');

    const w2 = await formTeam(5, rid);
    expect(w2.status).toBe('waiting');
    const overlap = w1.players.filter((id) => w2.players.includes(id));
    expect(overlap).toHaveLength(0);

    const teams = await getTeams(rid);
    expect(teams.filter((t) => t.status === 'waiting')).toHaveLength(2);
  });

  it('com 1 time em campo e times em waiting, novos formTeam viram waiting', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 20; i += 1) {
      await addPlayer(`P${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const t1 = await formTeam(5, rid);
    const t2 = await formTeam(5, rid);
    const t3 = await formTeam(5, rid);
    expect(t3.status).toBe('waiting');

    const finished = await scheduleMatch(rid, t1.id, t2.id, { teamSize: 5 });
    await finalizeMatch(finished.id, 'A_win', { teamSize: 5 });

    const inFieldAfter = (await getTeams(rid)).filter((t) => t.status === 'in_field');
    expect(inFieldAfter).toHaveLength(2);

    const mid = await formTeam(5, rid);
    expect(mid.status).toBe('waiting');
  });
});

describe('formAllTeamsPossible', () => {
  it('forma todos os times completos que a fila permite', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 12; i += 1) {
      await addPlayer(`P${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const formed = await formAllTeamsPossible(3, rid);
    expect(formed).toHaveLength(4);
    const all = await getTeams(rid);
    expect(all.filter((t) => t.roundId === rid)).toHaveLength(4);
  });

  it('propaga erro se nenhum time pode ser formado', async () => {
    const rid = await testRoundId();
    await addPlayer('A');
    await expect(formAllTeamsPossible(5, rid)).rejects.toThrow(
      'Jogadores insuficientes para formar um time de 5. Necessário: 5, disponível: 1.'
    );
  });
});

describe('removePlayer', () => {
  it('sem substituto: lesão tira o jogador de campo e não puxa outro', async () => {
    const rid = await testRoundId();
    await addPlayer('João');
    await addPlayer('X1');
    await addPlayer('X2');
    await addPlayer('Rep');
    await addPlayer('Floater');
    await new Promise((r) => setTimeout(r, 5));
    await formTeam(1, rid);
    await formTeam(1, rid);
    const waitingTeam = await formTeam(1, rid);
    expect(waitingTeam.status).toBe('waiting');

    const playersBefore = await getPlayers();
    const victim = playersBefore.find((p) => p.name === 'João');
    expect(victim.status).toBe('in_field');

    const { substituted } = await removePlayer(victim.id, 'injured', false, rid, 1);
    expect(substituted).toBe(false);

    const updated = await getPlayers();
    expect(updated.find((p) => p.id === victim.id).status).toBe('injured');
    const x2 = updated.find((p) => p.name === 'X2');
    expect(x2.status).not.toBe('in_field');
    const teamsAfter = await getTeams(rid);
    expect(teamsAfter.some((t) => (t.players || []).includes(victim.id))).toBe(false);
    const stillWaiting = teamsAfter.find((t) => t.id === waitingTeam.id);
    expect(stillWaiting).toBeDefined();
    expect(stillWaiting.players).toContain(updated.find((p) => p.name === 'X2').id);
  });

  it('sem substituto: cansado tira o jogador de campo e não puxa outro', async () => {
    const rid = await testRoundId();
    await addPlayer('Maria');
    await addPlayer('X');
    await addPlayer('Y');
    await addPlayer('Z');
    await new Promise((r) => setTimeout(r, 5));
    await formTeam(1, rid);
    await formTeam(1, rid);
    await formTeam(1, rid);

    const maria = (await getPlayers()).find((p) => p.name === 'Maria');
    const { substituted } = await removePlayer(maria.id, 'tired', false, rid, 1);
    expect(substituted).toBe(false);

    const players = await getPlayers();
    expect(players.find((p) => p.id === maria.id).status).toBe('tired');
    const y = players.find((p) => p.name === 'Y');
    expect(y.status).not.toBe('in_field');
    const teamsAfter = await getTeams(rid);
    expect(teamsAfter.some((t) => (t.players || []).includes(maria.id))).toBe(false);
  });

  it('sem time waiting e sem substituto: a vaga fica vazia', async () => {
    const rid = await testRoundId();
    for (const name of ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'Bench']) {
      await addPlayer(name);
      await new Promise((r) => setTimeout(r, 5));
    }
    await formTeam(3, rid);
    await formTeam(3, rid);

    const teams = await getTeams(rid);
    expect(teams.filter((t) => t.status === 'waiting')).toHaveLength(0);

    const inField = teams.find((t) => t.status === 'in_field');
    const victimId = inField.players[0];
    const { substituted } = await removePlayer(victimId, 'injured', false, rid, 3);
    expect(substituted).toBe(false);

    const players = await getPlayers();
    expect(players.find((p) => p.id === victimId).status).toBe('injured');
    const bench = players.find((p) => p.name === 'Bench');
    expect(bench.status).toBe('available');
    const fieldAfter = (await getTeams(rid)).find((t) => t.id === inField.id);
    expect(fieldAfter.players).not.toContain(bench.id);
    expect(fieldAfter.players).not.toContain(victimId);
    expect(fieldAfter.players).toHaveLength(2);
  });

  it('deve rejeitar motivo inválido', async () => {
    const player = await addPlayer('Test');
    await expect(removePlayer(player.id, 'invalid')).rejects.toThrow(
      "Motivo deve ser 'injured' ou 'tired'"
    );
  });

  it('deve substituir jogador (substitute=true) a partir do próximo time waiting', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 10; i += 1) {
      await addPlayer(`J${i}`);
      await new Promise((r) => setTimeout(r, 8));
    }

    await formTeam(3, rid);
    await formTeam(3, rid);
    const waiting = await formTeam(3, rid);
    expect(waiting.status).toBe('waiting');

    const teams = await getTeams(rid);
    const inFieldA = teams.find((t) => t.status === 'in_field');
    const firstPlayerId = inFieldA.players[0];

    await removePlayer(firstPlayerId, 'tired', true, rid, 3);

    const players = await getPlayers();
    expect(players.find((p) => p.id === firstPlayerId).status).toBe('tired');

    const fromHead = players.find((p) => p.name === 'J7');
    expect(fromHead.status).toBe('in_field');
    const inFieldAfter = (await getTeams(rid)).filter((t) => t.status === 'in_field');
    expect(inFieldAfter.some((t) => t.players.includes(fromHead.id))).toBe(true);

    const j10 = players.find((p) => p.name === 'J10');
    const waitingAfter = (await getTeams(rid)).find((t) => t.status === 'waiting');
    expect(waitingAfter.players).toContain(j10.id);
  });

  it('sem jogador na fila global: dissolve o último waiting e libera o elenco', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 12; i += 1) {
      await addPlayer(`J${i}`);
      await new Promise((r) => setTimeout(r, 8));
    }

    // Dois primeiros times em campo; 3º e 4º waiting (regra formTeam: waiting só após 2 in_field).
    await formTeam(3, rid);
    await formTeam(3, rid);
    await formTeam(3, rid);
    await formTeam(3, rid);

    const teams = await getTeams(rid);
    const inFieldA = teams.find((t) => t.status === 'in_field');
    const firstPlayerId = inFieldA.players[0];

    await removePlayer(firstPlayerId, 'tired', true, rid, 3);

    const players = await getPlayers();
    expect(players.find((p) => p.id === firstPlayerId).status).toBe('tired');

    const fromHead = players.find((p) => p.name === 'J7');
    expect(fromHead.status).toBe('in_field');

    const teamsAfter = await getTeams(rid);
    const waitingTeams = teamsAfter.filter((t) => t.status === 'waiting');
    expect(waitingTeams).toHaveLength(1);
    expect(waitingTeams[0].players).toHaveLength(3);

    const j11 = players.find((p) => p.name === 'J11');
    const j12 = players.find((p) => p.name === 'J12');
    expect(j11.status).toBe('available');
    expect(j12.status).toBe('available');
    expect(waitingTeams[0].players.includes(j11.id)).toBe(false);
    expect(waitingTeams[0].players.includes(j12.id)).toBe(false);
  });

  it('lesão em waiting sem puxar outro: o time abaixo do tamanho dissolve', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 12; i += 1) {
      await addPlayer(`P${i}`);
      await new Promise((r) => setTimeout(r, 4));
    }
    await formTeam(3, rid);
    await formTeam(3, rid);
    await formTeam(3, rid);
    const waitingTeams = (await getTeams(rid)).filter((t) => t.status === 'waiting');
    expect(waitingTeams).toHaveLength(1);
    const victimId = waitingTeams[0].players[0];
    const teammates = waitingTeams[0].players.filter((id) => id !== victimId);
    const { substituted } = await removePlayer(victimId, 'injured', false, rid, 3);
    expect(substituted).toBe(false);
    const teamsAfter = await getTeams(rid);
    expect(teamsAfter.filter((t) => t.status === 'waiting')).toHaveLength(0);
    const players = await getPlayers();
    expect(players.find((p) => p.id === victimId).status).toBe('injured');
    for (const tid of teammates) {
      expect(players.find((p) => p.id === tid).status).toBe('available');
    }
  });

  it('lesão em waiting sem substituto: dissolve o time e libera o elenco', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 9; i += 1) {
      await addPlayer(`Q${i}`);
      await new Promise((r) => setTimeout(r, 4));
    }
    await formTeam(3, rid);
    await formTeam(3, rid);
    await formTeam(3, rid);
    const waiting = (await getTeams(rid)).find((t) => t.status === 'waiting');
    expect(waiting).toBeDefined();
    const victimId = waiting.players[0];
    const { substituted } = await removePlayer(victimId, 'tired', false, rid, 3);
    expect(substituted).toBe(false);
    const teamsAfter = await getTeams(rid);
    expect(teamsAfter.filter((t) => t.status === 'waiting')).toHaveLength(0);
    const players = await getPlayers();
    const teammates = waiting.players.filter((id) => id !== victimId);
    for (const tid of teammates) {
      expect(players.find((p) => p.id === tid).status).toBe('available');
    }
    expect(players.find((p) => p.id === victimId).status).toBe('tired');
  });

  it('fora de campo: lesionado/cansado vai para o fim da lista (joinedAt)', async () => {
    await addPlayer('A');
    await new Promise((r) => setTimeout(r, 5));
    await addPlayer('B');
    await new Promise((r) => setTimeout(r, 5));
    await addPlayer('C');
    const b = (await getPlayers(true)).find((p) => p.name === 'B');
    await removePlayer(b.id, 'injured', false);
    const after = await getPlayers(true);
    expect(after[after.length - 1].name).toBe('B');
    expect(after[after.length - 1].status).toBe('injured');
  });

  it('restorePlayerToAvailable libera cansado/lesionado para o fim da fila', async () => {
    const rid = await testRoundId();
    await addPlayer('Alpha');
    await addPlayer('Beta');
    await addPlayer('Gamma');
    await addPlayer('Delta');
    await new Promise((r) => setTimeout(r, 5));
    await formTeam(1, rid);
    await formTeam(1, rid);
    await formTeam(1, rid);
    const alpha = (await getPlayers()).find((p) => p.name === 'Alpha');
    await removePlayer(alpha.id, 'tired', false, rid, 1);
    expect((await getPlayers()).find((x) => x.id === alpha.id).status).toBe('tired');

    await restorePlayerToAvailable(alpha.id);
    const after = (await getPlayers()).find((x) => x.id === alpha.id);
    expect(after.status).toBe('available');
    expect(new Date(after.joinedAt).getTime()).toBeGreaterThan(0);
  });

  it('cansado em campo coloca o jogador escolhido na vaga', async () => {
    const rid = await testRoundId();
    for (const name of ['A1', 'A2', 'A3', 'Bench']) {
      await addPlayer(name);
      await new Promise((r) => setTimeout(r, 5));
    }
    await formTeam(3, rid);
    const field = (await getTeams(rid)).find((t) => t.status === 'in_field');
    const outgoing = (await getPlayers()).find((p) => p.id === field.players[0]);
    const bench = (await getPlayers()).find((p) => p.name === 'Bench');
    const benchJoinedAt = bench.joinedAt;

    await replaceFieldPlayerWith(outgoing.id, bench.id, rid, 3);

    const players = await getPlayers();
    const tired = players.find((p) => p.id === outgoing.id);
    const seated = players.find((p) => p.id === bench.id);
    expect(tired.status).toBe('tired');
    expect(tired.joinedAt).not.toBe(benchJoinedAt);
    expect(seated.status).toBe('in_field');
    expect(seated.joinedAt).toBe(benchJoinedAt);
    const fieldAfter = (await getTeams(rid)).find((t) => t.id === field.id);
    expect(fieldAfter.players).toContain(bench.id);
    expect(fieldAfter.players).not.toContain(outgoing.id);
  });

  it('sub troca a vaga e a posição na fila, sem marcar cansado', async () => {
    const rid = await testRoundId();
    for (const name of ['A1', 'A2', 'A3', 'Bench']) {
      await addPlayer(name);
      await new Promise((r) => setTimeout(r, 5));
    }
    await formTeam(3, rid);
    const field = (await getTeams(rid)).find((t) => t.status === 'in_field');
    const outgoing = (await getPlayers()).find((p) => p.id === field.players[0]);
    const bench = (await getPlayers()).find((p) => p.name === 'Bench');

    await swapRosterPlayer(outgoing.id, bench.id, rid, 3);

    const players = await getPlayers();
    const left = players.find((p) => p.id === outgoing.id);
    const seated = players.find((p) => p.id === bench.id);
    expect(left.status).toBe('available');
    expect(left.joinedAt).toBe(bench.joinedAt);
    expect(seated.status).toBe('in_field');
    expect(seated.joinedAt).toBe(outgoing.joinedAt);
    const fieldAfter = (await getTeams(rid)).find((t) => t.id === field.id);
    expect(fieldAfter.players[0]).toBe(bench.id);
  });
});

describe('updatePlayerName', () => {
  it('deve atualizar o nome do jogador', async () => {
    const p = await addPlayer('Antigo');
    await updatePlayerName(p.id, '  Novo Nome  ');
    const list = await getPlayers();
    expect(list.find((x) => x.id === p.id).name).toBe('Novo Nome');
  });

  it('deve rejeitar nome vazio', async () => {
    const p = await addPlayer('X');
    await expect(updatePlayerName(p.id, '   ')).rejects.toThrow('Nome do jogador é obrigatório.');
  });
});

describe('updateTeamDisplayName', () => {
  it('deve definir e limpar displayName', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 5; i += 1) {
      await addPlayer(`T${i}`);
      await new Promise((r) => setTimeout(r, 3));
    }
    const team = await formTeam(5, rid);
    await updateTeamDisplayName(team.id, '  Os Gênios  ');
    let teams = await getTeams(rid);
    expect(teams.find((t) => t.id === team.id).displayName).toBe('Os Gênios');

    await updateTeamDisplayName(team.id, '');
    teams = await getTeams(rid);
    expect(teams.find((t) => t.id === team.id).displayName).toBeUndefined();
  });
});

describe('updateTeamRoster', () => {
  it('deve trocar um jogador do elenco por outro disponível na fila', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 6; i += 1) {
      await addPlayer(`R${i}`);
      await new Promise((r) => setTimeout(r, 3));
    }
    const team = await formTeam(5, rid);
    const onBench = (await getPlayers(true)).find((p) => p.name === 'R6');
    expect(onBench.status).toBe('available');
    const outId = team.players[0];
    const nextIds = [team.players[1], team.players[2], team.players[3], team.players[4], onBench.id];
    await updateTeamRoster(team.id, nextIds, rid, { teamSize: 5 });
    const updated = (await getTeams(rid)).find((t) => t.id === team.id);
    expect(updated.players).toEqual(nextIds);
    const outP = (await getPlayers(true)).find((p) => p.id === outId);
    expect(outP.status).toBe('available');
  });

  it('dois jogadores removidos do elenco voltam à fila na ordem do card', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 5; i += 1) {
      await addPlayer(`O${i}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    const team = await formTeam(5, rid);
    const [first, second, ...keep] = team.players;
    await updateTeamRoster(team.id, keep, rid, { teamSize: 5 });
    const players = await getPlayers(false);
    const a = players.find((p) => p.id === first);
    const b = players.find((p) => p.id === second);
    expect(a.status).toBe('available');
    expect(b.status).toBe('available');
    expect(new Date(a.joinedAt).getTime()).toBeLessThan(new Date(b.joinedAt).getTime());
  });

  it('deve rejeitar jogador que já está em outro time', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 10; i += 1) {
      await addPlayer(`X${i}`);
      await new Promise((r) => setTimeout(r, 3));
    }
    const t1 = await formTeam(5, rid);
    const t2 = await formTeam(5, rid);
    const steal = t2.players[0];
    await expect(
      updateTeamRoster(t1.id, [...t1.players.filter((id) => id !== t1.players[0]), steal], rid, {
        teamSize: 5,
      })
    ).rejects.toThrow(/outro time/);
  });
});

describe('rebalanceTeams', () => {
  it('mistura só os times em campo desbloqueados e mantém cada jogador em um time', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 15; i += 1) {
      await addPlayer(`R${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const teamA = await formTeam(5, rid);
    const teamB = await formTeam(5, rid);
    const blocked = await formTeam(5, rid);
    await setTeamStatus(blocked.id, 'in_field');
    await toggleTeamBlocked(blocked.id);

    const blockedRoster = [...blocked.players];
    const pool = new Set([...teamA.players, ...teamB.players]);

    await rebalanceTeams(rid);

    const teams = await getTeams(rid);
    const blockedAfter = teams.find((t) => t.id === blocked.id);
    expect(blockedAfter.isBlocked).toBe(true);
    expect(blockedAfter.players).toEqual(blockedRoster);

    const seen = [];
    for (const team of teams.filter((t) => t.id === teamA.id || t.id === teamB.id)) {
      expect(team.players).toHaveLength(5);
      for (const pid of team.players) {
        expect(pool.has(pid)).toBe(true);
        seen.push(pid);
      }
    }
    expect(new Set(seen).size).toBe(pool.size);
    expect(seen).toHaveLength(pool.size);
  });
});

describe('partidas agendadas: updateScheduledMatchTeams e cancelScheduledMatch', () => {
  async function setupThreeTeamsScheduled() {
    const rid = await testRoundId();
    for (let i = 1; i <= 15; i += 1) {
      await addPlayer(`S${i}`);
      await new Promise((r) => setTimeout(r, 3));
    }
    const t1 = await formTeam(5, rid);
    const t2 = await formTeam(5, rid);
    const t3 = await formTeam(5, rid);
    const match = await scheduleMatch(rid, t1.id, t2.id, { teamSize: 5 });
    return { rid, t1, t2, t3, match };
  }

  it('não cria uma segunda partida agendada na mesma rodada', async () => {
    const { rid, t1, t3, match } = await setupThreeTeamsScheduled();
    await expect(scheduleMatch(rid, t1.id, t3.id, { teamSize: 5 })).rejects.toThrow(
      'Já existe uma partida agendada nesta rodada.'
    );
    const scheduled = (await getMatches(rid)).filter((m) => m.status === 'scheduled');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].id).toBe(match.id);
  });

  it('updateScheduledMatchTeams troca times e remove stats rascunho', async () => {
    const { rid, t1, t2, t3, match } = await setupThreeTeamsScheduled();

    await bulkUpsertPlayerStats(match.id, rid, [
      {
        playerId: t1.players[0],
        teamId: t1.id,
        goals: 1,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: t2.players[0],
        teamId: t2.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
    ]);
    expect((await listPlayerStatsForMatch(match.id)).length).toBeGreaterThan(0);

    await updateScheduledMatchTeams(match.id, t1.id, t3.id, { teamSize: 5 });
    const updated = (await getMatches(rid)).find((m) => m.id === match.id);
    expect(updated.teamA).toBe(t1.id);
    expect(updated.teamB).toBe(t3.id);
    expect(await listPlayerStatsForMatch(match.id)).toHaveLength(0);
  });

  it('cancelScheduledMatch remove a partida', async () => {
    const { rid, t1, t2, match } = await setupThreeTeamsScheduled();
    await cancelScheduledMatch(match.id);
    const matches = await getMatches(rid);
    expect(matches.find((m) => m.id === match.id)).toBeUndefined();
  });

  it('deleteMatch remove partida agendada', async () => {
    const { rid, t1, t2, match } = await setupThreeTeamsScheduled();
    await deleteMatch(match.id);
    const matches = await getMatches(rid);
    expect(matches.find((m) => m.id === match.id)).toBeUndefined();
  });

  it('getMatchScoresForRound inclui gols contra do adversário no placar', async () => {
    const { rid, t1, t2, match } = await setupThreeTeamsScheduled();
    await bulkUpsertPlayerStats(match.id, rid, [
      {
        playerId: t1.players[0],
        teamId: t1.id,
        goals: 1,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: t2.players[0],
        teamId: t2.id,
        goals: 0,
        assists: 0,
        ownGoals: 1,
        wasGoalkeeper: false,
      },
    ]);
    const scores = await getMatchScoresForRound(rid);
    expect(scores[match.id].scoreA).toBe(2);
    expect(scores[match.id].scoreB).toBe(0);
  });
});

describe('exclusões permanentes (jogador, time, partida finalizada)', () => {
  it('deletePlayerPermanently remove jogador, elenco e stats da partida', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 11; i += 1) {
      await addPlayer(`P${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const t1 = await formTeam(5, rid);
    const t2 = await formTeam(5, rid);
    const match = await scheduleMatch(rid, t1.id, t2.id, { teamSize: 5 });
    const victimId = t1.players[0];
    await bulkUpsertPlayerStats(match.id, rid, [
      {
        playerId: victimId,
        teamId: t1.id,
        goals: 1,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: t2.players[0],
        teamId: t2.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
    ]);
    expect((await listPlayerStatsForMatch(match.id)).some((s) => s.playerId === victimId)).toBe(
      true
    );

    await deletePlayerPermanently(victimId);
    const players = await getPlayers();
    expect(players.some((p) => p.id === victimId)).toBe(false);
    const stats = await listPlayerStatsForMatch(match.id);
    expect(stats.some((s) => s.playerId === victimId)).toBe(false);
    const t1After = (await getTeams(rid)).find((t) => t.id === t1.id);
    expect(t1After.players.includes(victimId)).toBe(false);
  });

  it('deleteTeam bloqueia se time está em partida', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 15; i += 1) {
      await addPlayer(`T${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const t1 = await formTeam(5, rid);
    const t2 = await formTeam(5, rid);
    await formTeam(5, rid);
    await scheduleMatch(rid, t1.id, t2.id, { teamSize: 5 });
    await expect(deleteTeam(t1.id)).rejects.toThrow(/partida/i);
  });

  it('deleteTeam apaga time sem partida vinculada', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 5; i += 1) {
      await addPlayer(`X${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const t = await formTeam(5, rid);
    await deleteTeam(t.id);
    const teams = await getTeams(rid);
    expect(teams.find((x) => x.id === t.id)).toBeUndefined();
  });

  it('deleteTeam devolve elenco à fila (available) para poder formar de novo', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 5; i += 1) {
      await addPlayer(`Q${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const t = await formTeam(5, rid);
    const ids = [...t.players];
    await deleteTeam(t.id);
    const playersAfter = await getPlayers();
    for (const id of ids) {
      expect(playersAfter.find((x) => x.id === id)?.status).toBe('available');
    }
    await expect(formTeam(5, rid)).resolves.toMatchObject({ players: expect.any(Array) });
  });

  it('deleteMatch apaga partida finalizada e stats', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 15; i += 1) {
      await addPlayer(`F${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const t1 = await formTeam(5, rid);
    const t2 = await formTeam(5, rid);
    await formTeam(5, rid);
    const sched = await scheduleMatch(rid, t1.id, t2.id, { teamSize: 5 });
    await bulkUpsertPlayerStats(sched.id, rid, [
      {
        playerId: t1.players[0],
        teamId: t1.id,
        goals: 2,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: t2.players[0],
        teamId: t2.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
    ]);
    await finalizeMatch(sched.id, 'A_win', { teamSize: 5 });
    expect((await listPlayerStatsForMatch(sched.id)).length).toBeGreaterThan(0);
    await deleteMatch(sched.id);
    expect((await getMatches(rid)).find((m) => m.id === sched.id)).toBeUndefined();
    expect(await listPlayerStatsForMatch(sched.id)).toHaveLength(0);
  });
});

describe('goleiro externo', () => {
  async function setupMatchWithBench() {
    const rid = await testRoundId();
    for (let i = 1; i <= 11; i++) {
      await addPlayer(`B${i}`);
      await new Promise((r) => setTimeout(r, 3));
    }
    const t1 = await formTeam(5, rid);
    const t2 = await formTeam(5, rid);
    const players = await getPlayers();
    const bench = players.find((p) => p.status === 'available');
    expect(bench).toBeDefined();
    const match = await scheduleMatch(rid, t1.id, t2.id, { teamSize: 5 });
    return { rid, t1, t2, match, bench };
  }

  it('bulkUpsert aceita goleiro disponível fora do elenco', async () => {
    const { rid, t1, t2, match, bench } = await setupMatchWithBench();
    await bulkUpsertPlayerStats(match.id, rid, [
      {
        playerId: t1.players[0],
        teamId: t1.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: t2.players[0],
        teamId: t2.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: bench.id,
        teamId: t1.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: true,
      },
    ]);
    const stats = await listPlayerStatsForMatch(match.id);
    expect(stats.filter((s) => s.wasGoalkeeper).length).toBe(1);
  });

  it('bulkUpsert rejeita goleiro que está no elenco de campo', async () => {
    const { rid, t1, t2, match } = await setupMatchWithBench();
    await expect(
      bulkUpsertPlayerStats(match.id, rid, [
        {
          playerId: t1.players[0],
          teamId: t1.id,
          goals: 0,
          assists: 0,
          ownGoals: 0,
          wasGoalkeeper: true,
        },
      ])
    ).rejects.toThrow(/Goleiro externo não pode estar no elenco/);
  });

  it('finalizeMatch mantém goleiro no time waiting', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 15; i++) {
      await addPlayer(`W${i}`);
      await new Promise((r) => setTimeout(r, 3));
    }
    const t1 = await formTeam(5, rid);
    const t2 = await formTeam(5, rid);
    const t3 = await formTeam(5, rid);
    expect(t3.status).toBe('waiting');
    const gkId = t3.players[0];
    const match = await scheduleMatch(rid, t1.id, t2.id, { teamSize: 5 });

    await bulkUpsertPlayerStats(match.id, rid, [
      {
        playerId: t1.players[0],
        teamId: t1.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: t2.players[0],
        teamId: t2.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: gkId,
        teamId: t1.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: true,
      },
    ]);

    await finalizeMatch(match.id, 'A_win', { teamSize: 5 });

    const teams = await getTeams(rid);
    const t3After = teams.find((t) => t.id === t3.id);
    expect(t3After).toBeDefined();
    expect(t3After.players.includes(gkId)).toBe(true);
  });

  it('getRoundStatistics conta partidas como goleiro', async () => {
    const { rid, t1, t2, match, bench } = await setupMatchWithBench();
    await bulkUpsertPlayerStats(match.id, rid, [
      {
        playerId: t1.players[0],
        teamId: t1.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: t2.players[0],
        teamId: t2.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        playerId: bench.id,
        teamId: t1.id,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: true,
      },
    ]);
    await finalizeMatch(match.id, 'A_win', { teamSize: 5 });

    const stats = await getRoundStatistics(rid);
    const benchRow = stats.find((r) => r.playerId === bench.id);
    expect(benchRow).toBeDefined();
    expect(benchRow.goalkeeperMatches).toBe(1);
  });
});

describe('finalizeMatch devolve o perdedor na ordem do elenco', () => {
  it('perdedor volta à fila com joinedAt na ordem do elenco (FIFO estável)', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 10; i += 1) {
      await addPlayer(`P${i}`);
      await new Promise((r) => setTimeout(r, 4));
    }
    const teamA = await formTeam(5, rid);
    const teamB = await formTeam(5, rid);
    const orderB = [...teamB.players];
    const match = await scheduleMatch(rid, teamA.id, teamB.id, { teamSize: 5 });
    await finalizeMatch(match.id, 'A_win', { teamSize: 5 });
    const players = await getPlayers(true);
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));
    const times = orderB.map((id) => Date.parse(byId[id].joinedAt));
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });
});

describe('exportData e importData', () => {
  it('deve exportar todos os dados', async () => {
    await addPlayer('P1');
    await addPlayer('P2');

    const data = await exportData();
    expect(data.players).toHaveLength(2);
    expect(data.teams).toBeDefined();
    expect(data.matches).toBeDefined();
    expect(data.rounds).toBeDefined();
    expect(data.meta).toBeDefined();
    expect(data.player_stats).toBeDefined();
    expect(data.schemaVersion).toBe(3);
    expect(data.exportedAt).toBeDefined();
  });

  it('deve importar dados e substituir existentes', async () => {
    await addPlayer('Existente');

    const importPayload = {
      players: [
        {
          id: crypto.randomUUID(),
          name: 'Importado1',
          status: 'available',
          joinedAt: new Date().toISOString(),
          goals: 0,
          assists: 0,
        },
        {
          id: crypto.randomUUID(),
          name: 'Importado2',
          status: 'available',
          joinedAt: new Date().toISOString(),
          goals: 0,
          assists: 0,
        },
      ],
      teams: [],
      matches: [],
    };

    await importData(importPayload);

    const players = await getPlayers();
    // Deve ter apenas os importados (o existente foi limpo)
    expect(players).toHaveLength(2);
    expect(players.map((p) => p.name)).toContain('Importado1');
    expect(players.map((p) => p.name)).toContain('Importado2');
    expect(players.map((p) => p.name)).not.toContain('Existente');
  });

  it('deve rejeitar JSON inválido', async () => {
    await expect(importData({})).rejects.toThrow('JSON inválido');
    await expect(importData(null)).rejects.toThrow('JSON inválido');
  });

  it('não apaga o banco quando players não é uma lista', async () => {
    await addPlayer('Fica');
    await expect(importData({ players: {}, teams: [], matches: [] })).rejects.toThrow(
      'JSON inválido'
    );
    const players = await getPlayers();
    expect(players.map((p) => p.name)).toContain('Fica');
  });

  it('não apaga o banco quando meta ou player_stats não é uma lista', async () => {
    await addPlayer('Fica');
    await expect(
      importData({ players: [], teams: [], matches: [], meta: { key: 'x', value: 1 } })
    ).rejects.toThrow('JSON inválido');
    expect((await getPlayers()).map((p) => p.name)).toContain('Fica');

    await expect(
      importData({ players: [], teams: [], matches: [], player_stats: { id: 'x' } })
    ).rejects.toThrow('JSON inválido');
    expect((await getPlayers()).map((p) => p.name)).toContain('Fica');
  });

  it('deve fazer roundtrip export → import', async () => {
    await addPlayer('RT1');
    await addPlayer('RT2');
    await addPlayer('RT3');

    const exported = await exportData();
    await deleteDatabase();

    await importData(exported);

    const players = await getPlayers();
    expect(players).toHaveLength(3);
  });
});

describe('estatísticas globais e manutenção', () => {
  it('deve agregar vitórias/derrotas globais por jogador', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 10; i += 1) {
      await addPlayer(`G${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const teamA = await formTeam(5, rid);
    const teamB = await formTeam(5, rid);
    const match = await scheduleMatch(rid, teamA.id, teamB.id, { teamSize: 5 });

    await bulkUpsertPlayerStats(match.id, rid, [
      {
        teamId: teamA.id,
        playerId: teamA.players[0],
        goals: 1,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
      {
        teamId: teamB.id,
        playerId: teamB.players[0],
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      },
    ]);
    await finalizeMatch(match.id, 'A_win', { teamSize: 5 });

    const stats = await getGlobalPlayerStatistics();
    const winner = stats.find((s) => s.playerId === teamA.players[0]);
    const loser = stats.find((s) => s.playerId === teamB.players[0]);
    expect(winner.wins).toBe(1);
    expect(winner.losses).toBe(0);
    expect(loser.losses).toBe(1);
    expect(loser.wins).toBe(0);
  });

  it('deve remover player_stats órfãs e limpar ids de jogador inexistente em times', async () => {
    const rid = await testRoundId();
    const lone = await addPlayer('Lone');
    const team = await formTeam(1, rid);
    const fakePlayerId = crypto.randomUUID();

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['player_stats', 'teams'], 'readwrite');
      tx.objectStore('player_stats').add({
        id: crypto.randomUUID(),
        roundId: crypto.randomUUID(),
        matchId: crypto.randomUUID(),
        teamId: team.id,
        playerId: lone.id,
        goals: 1,
        assists: 0,
        ownGoals: 0,
        wasGoalkeeper: false,
      });
      tx.objectStore('teams').put({ ...team, players: [lone.id, fakePlayerId] });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const summary = await runDatastoreMaintenance();
    expect(summary.removedStats).toBe(1);
    expect(summary.scrubbedTeamPlayerSlots).toBe(1);

    const teams = await getTeams(rid);
    expect(teams.find((t) => t.id === team.id).players).toEqual([lone.id]);
  });

  it('runDatastoreMaintenance recoloca jogadores in_field que não estão em nenhum time', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 5; i += 1) {
      await addPlayer(`G${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const t = await formTeam(5, rid);
    const rosterIds = [...t.players];
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('teams', 'readwrite');
      tx.objectStore('teams').delete(t.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const summary = await runDatastoreMaintenance();
    expect(summary.requeuedGhostInField).toBe(5);
    const players = await getPlayers();
    for (const id of rosterIds) {
      expect(players.find((p) => p.id === id)?.status).toBe('available');
    }
  });

  it('runDatastoreMaintenance retira lesionados do elenco de times em espera', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 9; i += 1) {
      await addPlayer(`Gc${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    await formTeam(3, rid);
    await formTeam(3, rid);
    await formTeam(3, rid);
    const waiting = (await getTeams(rid)).find((t) => t.status === 'waiting');
    expect(waiting).toBeDefined();
    const hurtId = waiting.players[0];
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('players', 'readwrite');
      const store = tx.objectStore('players');
      const g = store.get(hurtId);
      g.onsuccess = () => {
        const p = g.result;
        p.status = 'injured';
        store.put(p);
      };
      g.onerror = () => reject(g.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const summary = await runDatastoreMaintenance();
    expect(summary.scrubbedTeamPlayerSlots).toBeGreaterThanOrEqual(1);
    const teamsAfter = await getTeams(rid);
    const wAfter = teamsAfter.find((t) => t.id === waiting.id);
    expect(wAfter.players).not.toContain(hurtId);
  });
});

describe('stress flow: alta carga com fadiga e substituição', () => {
  it('sustenta mais de 35 jogadores e mais de 20 partidas com churn de elenco', async () => {
    const rid = await testRoundId();
    const teamSize = 5;
    const playerCount = 40;
    const targetMatches = 22;

    for (let i = 1; i <= playerCount; i += 1) {
      await addPlayer(`StressP${i}`);
    }

    await formTeam(teamSize, rid);
    await formTeam(teamSize, rid);

    const churnMoments = [
      { matchNo: 4, reason: 'tired' },
      { matchNo: 8, reason: 'injured' },
      { matchNo: 12, reason: 'tired' },
      { matchNo: 16, reason: 'injured' },
      { matchNo: 20, reason: 'tired' },
    ];

    let substitutions = 0;
    const churnedPlayerIds = new Set();

    for (let i = 1; i <= targetMatches; i += 1) {
      let teams = await getTeams(rid);
      let inField = teams.filter((t) => t.status === 'in_field');
      while (inField.length < 2) {
        await formTeam(teamSize, rid);
        teams = await getTeams(rid);
        inField = teams.filter((t) => t.status === 'in_field');
      }
      expect(inField.length).toBeGreaterThanOrEqual(2);

      const open = (await getMatches(rid)).find((m) => m.status === 'scheduled');
      const match = open ?? (await scheduleMatch(rid, inField[0].id, inField[1].id, { teamSize }));
      const result = i % 5 === 0 ? 'draw' : i % 2 === 0 ? 'B_win' : 'A_win';
      await finalizeMatch(match.id, result, { teamSize });

      const churn = churnMoments.find((c) => c.matchNo === i);
      if (churn) {
        let teamsAfterMatch = await getTeams(rid);
        let inFieldAfterMatch = teamsAfterMatch.filter((t) => t.status === 'in_field');
        while (inFieldAfterMatch.length < 2) {
          await formTeam(teamSize, rid);
          teamsAfterMatch = await getTeams(rid);
          inFieldAfterMatch = teamsAfterMatch.filter((t) => t.status === 'in_field');
        }

        const players = await getPlayers(false);
        const victim =
          players.find(
          (p) => p.status === 'in_field' && !churnedPlayerIds.has(p.id)
          ) || players.find((p) => p.status === 'in_field');
        expect(victim).toBeDefined();

        const out = await removePlayer(victim.id, churn.reason, true, rid, teamSize);
        expect(out.substituted).toBe(true);
        substitutions += 1;
        churnedPlayerIds.add(victim.id);
      }
    }

    const matches = await getMatches(rid);
    const finalized = matches.filter((m) => m.status === 'finalized');
    expect(finalized.length).toBeGreaterThan(20);

    const playersAfter = await getPlayers(false);
    const tiredOrInjured = playersAfter.filter((p) => ['tired', 'injured'].includes(p.status));
    expect(playersAfter).toHaveLength(playerCount);
    expect(substitutions).toBeGreaterThanOrEqual(5);
    expect(tiredOrInjured.length).toBeGreaterThanOrEqual(3);
  });
});

describe('updateRoundName', () => {
  it('grava o nome e vazio volta ao rótulo com data', async () => {
    const id = await testRoundId();
    const renamed = await updateRoundName(id, 'Sábado');
    expect(renamed.name).toBe('Sábado');
    expect((await getRound(id)).name).toBe('Sábado');

    const fallback = await updateRoundName(id, '   ');
    expect(fallback.name.startsWith('Rodada ')).toBe(true);
    expect(fallback.name).not.toBe('Sábado');
  });

  it('rejeita rodada inexistente', async () => {
    await expect(updateRoundName('no-such-round', 'Nome')).rejects.toThrow('Rodada não encontrada.');
  });
});

describe('finalizeMatch grava o próximo jogo na mesma transação', () => {
  it('empate com um time waiting e desempate forma o time da fila e agenda', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 20; i += 1) {
      await addPlayer(`D${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const fieldA = await formTeam(5, rid);
    const fieldB = await formTeam(5, rid);
    const waiting = await formTeam(5, rid);
    expect(waiting.status).toBe('waiting');
    const queueIds = (await getPlayers(false))
      .filter((p) => !fieldA.players.includes(p.id) && !fieldB.players.includes(p.id) && !waiting.players.includes(p.id))
      .map((p) => p.id);
    expect(queueIds).toHaveLength(5);

    const match = await scheduleMatch(rid, fieldA.id, fieldB.id, { teamSize: 5 });
    const saved = await finalizeMatch(match.id, 'draw', {
      teamSize: 5,
      tiebreakerWinnerTeamId: fieldA.id,
    });

    expect(saved.status).toBe('finalized');
    expect(saved.result).toBe('draw');
    const teams = await getTeams(rid);
    expect(teams.find((t) => t.id === fieldA.id)).toBeUndefined();
    expect(teams.find((t) => t.id === fieldB.id)).toBeUndefined();
    const waitingAfter = teams.find((t) => t.id === waiting.id);
    expect(waitingAfter.status).toBe('in_field');
    const created = teams.find((t) => t.id !== waiting.id);
    expect(created.status).toBe('in_field');
    expect([...created.players].sort()).toEqual([...queueIds].sort());

    const matches = await getMatches(rid);
    const scheduled = matches.filter((m) => m.status === 'scheduled');
    expect(scheduled).toHaveLength(1);
    expect([scheduled[0].teamA, scheduled[0].teamB].sort()).toEqual([waiting.id, created.id].sort());

    const players = await getPlayers(false);
    const winnerJoined = players
      .filter((p) => fieldA.players.includes(p.id))
      .map((p) => new Date(p.joinedAt).getTime());
    const loserJoined = players
      .filter((p) => fieldB.players.includes(p.id))
      .map((p) => new Date(p.joinedAt).getTime());
    expect(Math.max(...winnerJoined)).toBeLessThan(Math.min(...loserJoined));
    expect(Math.min(...loserJoined) - Math.max(...winnerJoined)).toBeGreaterThan(3_000_000);
  });

  it('vitória contra um único time waiting curto agenda o próximo jogo', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 15; i += 1) {
      await addPlayer(`V${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const fieldA = await formTeam(5, rid);
    const fieldB = await formTeam(5, rid);
    const waiting = await formTeam(5, rid);
    const shortRoster = waiting.players.slice(0, 3);
    await updateTeamRoster(waiting.id, shortRoster, rid, { teamSize: 5 });

    const match = await scheduleMatch(rid, fieldA.id, fieldB.id, { teamSize: 5 });
    await finalizeMatch(match.id, 'A_win', { teamSize: 5 });

    const teams = await getTeams(rid);
    expect(teams.find((t) => t.id === fieldB.id)).toBeUndefined();
    const winner = teams.find((t) => t.id === fieldA.id);
    const waitingAfter = teams.find((t) => t.id === waiting.id);
    expect(winner.status).toBe('in_field');
    expect(waitingAfter.status).toBe('in_field');
    expect(waitingAfter.players).toHaveLength(5);

    const matches = await getMatches(rid);
    expect(matches.find((m) => m.id === match.id).status).toBe('finalized');
    const scheduled = matches.filter((m) => m.status === 'scheduled');
    expect(scheduled).toHaveLength(1);
    expect([scheduled[0].teamA, scheduled[0].teamB].sort()).toEqual(
      [fieldA.id, waiting.id].sort()
    );
  });

  it('empate sem gente livre não cria a próxima partida e não grava o aviso', async () => {
    const rid = await testRoundId();
    for (let i = 1; i <= 15; i += 1) {
      await addPlayer(`S${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const fieldA = await formTeam(5, rid);
    const fieldB = await formTeam(5, rid);
    const waiting = await formTeam(5, rid);
    const match = await scheduleMatch(rid, fieldA.id, fieldB.id, { teamSize: 5 });
    const saved = await finalizeMatch(match.id, 'draw', {
      teamSize: 5,
      tiebreakerWinnerTeamId: fieldA.id,
    });
    expect(saved.scheduleSkipped).toBe(true);
    const stored = (await getMatches(rid)).find((m) => m.id === match.id);
    expect(stored.scheduleSkipped).toBeUndefined();
    expect((await getMatches(rid)).filter((m) => m.status === 'scheduled')).toHaveLength(0);
    expect((await getTeams(rid)).find((t) => t.id === waiting.id).status).toBe('waiting');
  });
});

describe('tamanho do time', () => {
  async function twoFieldTeams() {
    const rid = await testRoundId();
    for (let i = 1; i <= 10; i += 1) {
      await addPlayer(`Tz${i}`);
    }
    const teamA = await formTeam(5, rid);
    const teamB = await formTeam(5, rid);
    return { rid, teamA, teamB };
  }

  it('scheduleMatch recusa tamanho 0 e não grava a partida', async () => {
    const { rid, teamA, teamB } = await twoFieldTeams();

    await expect(scheduleMatch(rid, teamA.id, teamB.id, { teamSize: 0 })).rejects.toThrow(
      'Tamanho do time inválido'
    );
    expect(await getMatches(rid)).toHaveLength(0);
  });

  it('scheduleMatch recusa tamanho acima de 20 e não grava a partida', async () => {
    const { rid, teamA, teamB } = await twoFieldTeams();

    await expect(scheduleMatch(rid, teamA.id, teamB.id, { teamSize: 21 })).rejects.toThrow(
      'Tamanho do time inválido'
    );
    expect(await getMatches(rid)).toHaveLength(0);
  });

  it('scheduleMatch recusa tamanho quebrado e não grava a partida', async () => {
    const { rid, teamA, teamB } = await twoFieldTeams();

    await expect(scheduleMatch(rid, teamA.id, teamB.id, { teamSize: 1.5 })).rejects.toThrow(
      'Tamanho do time inválido'
    );
    expect(await getMatches(rid)).toHaveLength(0);
  });

  it('finalizeMatch recusa tamanho fora de 1 a 20 e não grava a partida', async () => {
    const { rid, teamA, teamB } = await twoFieldTeams();
    const match = await scheduleMatch(rid, teamA.id, teamB.id, { teamSize: 5 });

    await expect(finalizeMatch(match.id, 'A_win', { teamSize: 0 })).rejects.toThrow(
      'Tamanho do time inválido'
    );
    await expect(finalizeMatch(match.id, 'A_win', { teamSize: 21 })).rejects.toThrow(
      'Tamanho do time inválido'
    );
    await expect(finalizeMatch(match.id, 'A_win', { teamSize: 1.5 })).rejects.toThrow(
      'Tamanho do time inválido'
    );

    const matches = await getMatches(rid);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(match.id);
    expect(matches[0].status).toBe('scheduled');
    expect(matches[0].result).toBeNull();
  });
});

describe('atualização para a versão 3', () => {
  function seedDatabaseFromBeforeRounds(matches) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('teamQueueDB', 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        const playersStore = db.createObjectStore('players', { keyPath: 'id' });
        playersStore.createIndex('joinedAt', 'joinedAt', { unique: false });
        playersStore.createIndex('status', 'status', { unique: false });
        const teamsStore = db.createObjectStore('teams', { keyPath: 'id' });
        teamsStore.createIndex('status', 'status', { unique: false });
        db.createObjectStore('matches', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('matches', 'readwrite');
        const store = tx.objectStore('matches');
        for (const match of matches) store.add(match);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  }

  it('partida sem resultado continua agendada', async () => {
    await seedDatabaseFromBeforeRounds([
      {
        id: 'partida-aberta',
        teamA: 'time-azul',
        teamB: 'time-vermelho',
        result: null,
        timestamp: '2024-06-01T18:00:00.000Z',
      },
    ]);

    const roundId = await getActiveRoundId();
    const matches = await getMatches(roundId);
    const open = matches.find((m) => m.id === 'partida-aberta');
    expect(open.status).toBe('scheduled');
    expect(open.result).toBeNull();
  });

  it('partida com resultado continua finalizada e mantém o vencedor', async () => {
    await seedDatabaseFromBeforeRounds([
      {
        id: 'partida-fechada',
        teamA: 'time-azul',
        teamB: 'time-vermelho',
        result: 'A_win',
        timestamp: '2024-06-01T19:00:00.000Z',
      },
    ]);

    const roundId = await getActiveRoundId();
    const done = (await getMatches(roundId)).find((m) => m.id === 'partida-fechada');
    expect(done.status).toBe('finalized');
    expect(done.result).toBe('A_win');
    expect(done.winningTeamId).toBe('time-azul');
  });

  it('instalação nova começa a noite vazia', async () => {
    expect(await getPlayers()).toEqual([]);
    expect(await getTeams()).toEqual([]);
    expect(await getMatches()).toEqual([]);
  });
});


