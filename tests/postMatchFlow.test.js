import { describe, it, expect } from 'vitest';
import { planNextMatch, availablePlayersFifo } from '../src/domain/postMatchFlow.js';

const rid = 'r1';
const mkTeam = (id, status, players, extra = {}) => ({
  id,
  roundId: rid,
  status,
  players,
  createdAt: '2020-01-01T00:00:00.000Z',
  ...extra,
});
const mkPlayer = (id, status, joinedAt = '2020-01-02T00:00:00.000Z') => ({
  id,
  status,
  joinedAt,
});

describe('availablePlayersFifo', () => {
  it('ordena available por joinedAt', () => {
    const players = [
      mkPlayer('p2', 'available', '2020-01-03T00:00:00.000Z'),
      mkPlayer('p1', 'available', '2020-01-02T00:00:00.000Z'),
    ];
    const inRound = ['p1', 'p2'];
    const got = availablePlayersFifo(players, inRound);
    expect(got.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('coloca quem já está na rodada antes da fila livre, cada grupo por joinedAt', () => {
    const players = [
      mkPlayer('free-late', 'available', '2020-03-01T00:00:00.000Z'),
      mkPlayer('in-late', 'available', '2020-02-01T00:00:00.000Z'),
      mkPlayer('free-early', 'available', '2019-01-01T00:00:00.000Z'),
      mkPlayer('in-early', 'available', '2020-01-01T00:00:00.000Z'),
      mkPlayer('tired', 'tired', '2018-01-01T00:00:00.000Z'),
    ];
    const got = availablePlayersFifo(players, ['in-late', 'in-early']);
    expect(got.map((p) => p.id)).toEqual(['in-early', 'in-late', 'free-early', 'free-late']);
  });

  it('devolve lista vazia quando ninguém está available', () => {
    const got = availablePlayersFifo(
      [mkPlayer('p1', 'tired', '2020-01-01T00:00:00.000Z')],
      ['p1'],
    );
    expect(got).toEqual([]);
  });
});

describe('planNextMatch', () => {
  it('vitória + 1 waiting completo: agenda vencedor vs waiting', () => {
    const match = { teamA: 'A', teamB: 'B' };
    const teams = [
      mkTeam('A', 'in_field', [1, 2, 3, 4, 5]),
      mkTeam('W', 'waiting', [4, 5, 6, 7, 8], { enteredWaitingAt: '2019-01-01T00:00:00.000Z' }),
      mkTeam('B', 'waiting', [9, 10, 11, 12, 13], { enteredWaitingAt: '2020-01-01T00:00:00.000Z' }),
    ];
    const plan = planNextMatch({
      roundId: rid,
      match,
      result: 'A_win',
      teams,
      players: [],
      teamSize: 5,
      preWaitingTeamIds: [],
      tiebreakerWinnerTeamId: null,
    });
    expect(plan.type).toBe('schedule');
    expect(plan.teamAId).toBe('A');
    expect(plan.teamBId).toBe('W');
  });

  it('empate + 2+ waiting pós-jogo: agenda os dois primeiros FIFO', () => {
    const match = { teamA: 'A', teamB: 'B' };
    const teams = [
      mkTeam('W1', 'waiting', [1, 2], { enteredWaitingAt: '2018-01-01T00:00:00.000Z' }),
      mkTeam('W2', 'waiting', [3, 4], { enteredWaitingAt: '2019-01-01T00:00:00.000Z' }),
      mkTeam('A', 'waiting', [5, 6]),
      mkTeam('B', 'waiting', [7, 8]),
    ];
    const plan = planNextMatch({
      roundId: rid,
      match,
      result: 'draw',
      teams,
      players: [mkPlayer('1', 'available'), mkPlayer('2', 'available')],
      teamSize: 2,
      preWaitingTeamIds: [],
      tiebreakerWinnerTeamId: null,
    });
    expect(plan.type).toBe('schedule');
    expect(plan.teamAId).toBe('W1');
    expect(plan.teamBId).toBe('W2');
  });

  it('empate + 1 waiting pré: exige tiebreaker e oponente da fila livre', () => {
    const match = { teamA: 'A', teamB: 'B' };
    const teams = [
      mkTeam('W', 'waiting', [1, 'w2'], { enteredWaitingAt: '2018-01-01T00:00:00.000Z' }),
      mkTeam('A', 'waiting', [2]),
      mkTeam('B', 'waiting', [3]),
      mkTeam('Bench', 'waiting', ['10', '11'], { enteredWaitingAt: '2021-01-01T00:00:00.000Z' }),
    ];
    const players = [
      mkPlayer('10', 'available', '2019-01-01T00:00:00.000Z'),
      mkPlayer('11', 'available', '2019-02-01T00:00:00.000Z'),
      mkPlayer('q2', 'available', '2020-06-01T00:00:00.000Z'),
      mkPlayer('q1', 'available', '2020-05-01T00:00:00.000Z'),
    ];
    let plan = planNextMatch({
      roundId: rid,
      match,
      result: 'draw',
      teams,
      players,
      teamSize: 2,
      preWaitingTeamIds: ['W'],
      tiebreakerWinnerTeamId: null,
    });
    expect(plan.type).toBe('none');
    expect(plan.reason).toBe('tiebreaker_obrigatorio');

    plan = planNextMatch({
      roundId: rid,
      match,
      result: 'draw',
      teams,
      players,
      teamSize: 2,
      preWaitingTeamIds: ['W'],
      tiebreakerWinnerTeamId: 'A',
    });
    expect(plan.type).toBe('draw_one_waiting');
    expect(plan.waitingTeamId).toBe('W');
    expect(plan.newTeamPlayerIds).toEqual(['q1', 'q2']);
  });

  it('empate + 1 waiting: fila livre que não completa o time não agenda', () => {
    const match = { teamA: 'A', teamB: 'B' };
    const teams = [
      mkTeam('W', 'waiting', [1, 'w2'], { enteredWaitingAt: '2018-01-01T00:00:00.000Z' }),
      mkTeam('A', 'waiting', [2]),
      mkTeam('B', 'waiting', [3]),
      mkTeam('Bench', 'waiting', ['10', '11'], { enteredWaitingAt: '2021-01-01T00:00:00.000Z' }),
    ];
    const players = [
      mkPlayer('10', 'available', '2019-01-01T00:00:00.000Z'),
      mkPlayer('11', 'available', '2019-02-01T00:00:00.000Z'),
      mkPlayer('q1', 'available', '2020-05-01T00:00:00.000Z'),
    ];
    const plan = planNextMatch({
      roundId: rid,
      match,
      result: 'draw',
      teams,
      players,
      teamSize: 2,
      preWaitingTeamIds: ['W'],
      tiebreakerWinnerTeamId: 'A',
    });
    expect(plan.type).toBe('none');
    expect(plan.reason).toBe('fila_insuficiente_empate_1_waiting');
  });

  it('empate + único time em espera curto: não agenda e não completa pela fila', () => {
    const match = { teamA: 'A', teamB: 'B' };
    const teams = [
      mkTeam('W', 'waiting', ['w1', 'w2', 'w3'], { enteredWaitingAt: '2018-01-01T00:00:00.000Z' }),
      mkTeam('A', 'in_field', ['a1', 'a2', 'a3', 'a4', 'a5']),
      mkTeam('B', 'in_field', ['b1', 'b2', 'b3', 'b4', 'b5']),
    ];
    const players = [
      mkPlayer('q1', 'available', '2020-01-01T00:00:00.000Z'),
      mkPlayer('q2', 'available', '2020-01-02T00:00:00.000Z'),
      mkPlayer('q3', 'available', '2020-01-03T00:00:00.000Z'),
      mkPlayer('q4', 'available', '2020-01-04T00:00:00.000Z'),
      mkPlayer('q5', 'available', '2020-01-05T00:00:00.000Z'),
    ];
    const plan = planNextMatch({
      roundId: rid,
      match,
      result: 'draw',
      teams,
      players,
      teamSize: 5,
      preWaitingTeamIds: ['W'],
      tiebreakerWinnerTeamId: 'A',
    });
    expect(plan.type).toBe('none');
    expect(plan.reason).toBe('waiting_elenco_incompleto');
  });

  it('vitória + único waiting subdimensionado: remonta time com fila', () => {
    const match = { teamA: 'A', teamB: 'B' };
    const teams = [
      mkTeam('A', 'in_field', ['a1', 'a2', 'a3']),
      mkTeam('B', 'waiting', ['b1', 'b2', 'b3'], { enteredWaitingAt: '2020-01-01T00:00:00.000Z' }),
    ];
    const players = [
      mkPlayer('b1', 'available', '2020-01-01T00:00:00.000Z'),
      mkPlayer('b2', 'available', '2020-01-02T00:00:00.000Z'),
      mkPlayer('b3', 'available', '2020-01-03T00:00:00.000Z'),
      mkPlayer('q1', 'available', '2019-06-01T00:00:00.000Z'),
      mkPlayer('q2', 'available', '2019-07-01T00:00:00.000Z'),
    ];
    const plan = planNextMatch({
      roundId: rid,
      match,
      result: 'A_win',
      teams,
      players,
      teamSize: 5,
      preWaitingTeamIds: [],
      tiebreakerWinnerTeamId: null,
    });
    expect(plan.type).toBe('resize_waiting_schedule');
    expect(plan.winnerId).toBe('A');
    expect(plan.waitingTeamId).toBe('B');
    expect(plan.mergedPlayerIds).toHaveLength(5);
    expect(plan.mergedPlayerIds.slice(0, 3)).toEqual(['b1', 'b2', 'b3']);
    expect(plan.mergedPlayerIds.slice(3)).toEqual(['q1', 'q2']);
  });

  it('empate + 2+ waiting com elenco abaixo do teamSize: não agenda', () => {
    const match = { teamA: 'A', teamB: 'B' };
    const teams = [
      mkTeam('W1', 'waiting', [1, 2], { enteredWaitingAt: '2018-01-01T00:00:00.000Z' }),
      mkTeam('W2', 'waiting', [3, 4], { enteredWaitingAt: '2019-01-01T00:00:00.000Z' }),
      mkTeam('A', 'waiting', [5, 6]),
      mkTeam('B', 'waiting', [7, 8]),
    ];
    const plan = planNextMatch({
      roundId: rid,
      match,
      result: 'draw',
      teams,
      players: [],
      teamSize: 5,
      preWaitingTeamIds: [],
      tiebreakerWinnerTeamId: null,
    });
    expect(plan.type).toBe('none');
    expect(plan.reason).toBe('waiting_elenco_incompleto');
  });

  it('não planeja a próxima partida quando o tamanho está fora de 1 a 20', () => {
    const match = { teamA: 'A', teamB: 'B' };
    const teams = [
      mkTeam('W', 'waiting', [1], { enteredWaitingAt: '2018-01-01T00:00:00.000Z' }),
      mkTeam('A', 'waiting', [2]),
      mkTeam('B', 'waiting', [3]),
    ];
    const players = [
      mkPlayer('10', 'available', '2020-01-01T00:00:00.000Z'),
      mkPlayer('11', 'available', '2020-01-02T00:00:00.000Z'),
    ];
    const plan = planNextMatch({
      roundId: rid,
      match,
      result: 'draw',
      teams,
      players,
      teamSize: 0,
      preWaitingTeamIds: ['W'],
      tiebreakerWinnerTeamId: 'A',
    });
    expect(plan.type).toBe('none');
  });
});
