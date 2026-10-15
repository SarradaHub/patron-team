import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock, isConfiguredMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isConfiguredMock: vi.fn(() => true),
}));

vi.mock('../src/lib/supabaseClient.js', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
  isSupabaseConfigured: isConfiguredMock,
}));

import { exportToSupabase } from '../src/api/cloudExport.js';

const sampleExport = {
  schemaVersion: 3,
  exportedAt: '2026-05-24T12:00:00.000Z',
  players: [{ id: 'p1', name: 'Ana', status: 'available', joinedAt: '2026-01-01T10:00:00.000Z' }],
  teams: [],
  matches: [],
  rounds: [{ id: 'r1', name: 'Rodada 1', status: 'active' }],
  meta: [{ key: 'activeRoundId', value: 'r1' }],
  player_stats: [],
};

describe('exportToSupabase', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isConfiguredMock.mockReset();
    isConfiguredMock.mockReturnValue(true);
    sessionStorage.clear();
  });

  it('reusa o mesmo export id quando o mesmo snapshot falha e é enviado de novo', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    });

    await expect(exportToSupabase(sampleExport)).rejects.toThrow(/Network error/);
    await expect(exportToSupabase(sampleExport)).rejects.toThrow(/Network error/);

    const firstId = invokeMock.mock.calls[0][1].body.exportId;
    const secondId = invokeMock.mock.calls[1][1].body.exportId;
    expect(secondId).toBe(firstId);
  });

  it('gera um export id novo para um snapshot diferente', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    });

    await expect(exportToSupabase(sampleExport)).rejects.toThrow(/Network error/);

    const otherSnapshot = {
      ...sampleExport,
      exportedAt: '2026-05-24T18:00:00.000Z',
    };
    await expect(exportToSupabase(otherSnapshot)).rejects.toThrow(/Network error/);

    const firstId = invokeMock.mock.calls[0][1].body.exportId;
    const secondId = invokeMock.mock.calls[1][1].body.exportId;
    expect(secondId).not.toBe(firstId);
  });

  it('gera um export id novo depois que o servidor aceita o snapshot', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, batchId: 'batch-1' },
      error: null,
    });

    await exportToSupabase(sampleExport);
    await exportToSupabase(sampleExport);

    const firstId = invokeMock.mock.calls[0][1].body.exportId;
    const secondId = invokeMock.mock.calls[1][1].body.exportId;
    expect(secondId).not.toBe(firstId);
  });

  it('gera um export id novo depois que o servidor marca duplicata', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, duplicate: true, batchId: 'existing' },
      error: null,
    });

    await exportToSupabase(sampleExport);
    await exportToSupabase(sampleExport);

    const firstId = invokeMock.mock.calls[0][1].body.exportId;
    const secondId = invokeMock.mock.calls[1][1].body.exportId;
    expect(secondId).not.toBe(firstId);
  });

  it('não envia de novo enquanto um envio está em andamento', async () => {
    let resolveInvoke;
    invokeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvoke = resolve;
        })
    );

    const first = exportToSupabase(sampleExport);
    const second = exportToSupabase(sampleExport);

    expect(invokeMock).toHaveBeenCalledTimes(1);

    resolveInvoke({
      data: { ok: true, batchId: 'batch-1' },
      error: null,
    });

    await expect(first).resolves.toMatchObject({ batchId: 'batch-1' });
    await expect(second).resolves.toMatchObject({ batchId: 'batch-1' });
  });

  it('mantém o mesmo export id depois de recarregar até o servidor aceitar o snapshot', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    });

    await expect(exportToSupabase(sampleExport)).rejects.toThrow(/Network error/);
    const firstId = invokeMock.mock.calls[0][1].body.exportId;

    vi.resetModules();
    const { exportToSupabase: exportAfterReload } = await import('../src/api/cloudExport.js');

    await expect(exportAfterReload(sampleExport)).rejects.toThrow(/Network error/);
    const secondId = invokeMock.mock.calls[1][1].body.exportId;
    expect(secondId).toBe(firstId);
  });

  it('envia payload com exportId e arrays preservados', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, batchId: 'batch-1', counts: { players: 1 } },
      error: null,
    });

    const result = await exportToSupabase(sampleExport);

    expect(invokeMock).toHaveBeenCalledWith('export-snapshot', {
      body: expect.objectContaining({
        exportId: expect.any(String),
        schemaVersion: 3,
        exportedAt: sampleExport.exportedAt,
        players: sampleExport.players,
        rounds: sampleExport.rounds,
        meta: sampleExport.meta,
        player_stats: [],
      }),
    });
    expect(result.batchId).toBe('batch-1');
  });

  it('trata resposta duplicate como sucesso', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, duplicate: true, batchId: 'existing' },
      error: null,
    });

    const result = await exportToSupabase(sampleExport);
    expect(result.duplicate).toBe(true);
  });

  it('lança erro quando supabase não configurado', async () => {
    isConfiguredMock.mockReturnValue(false);

    await expect(exportToSupabase(sampleExport)).rejects.toThrow(/Supabase não configurado/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('lança erro quando invoke falha', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    });

    await expect(exportToSupabase(sampleExport)).rejects.toThrow(/Network error/);
  });

  it('lança erro quando função retorna ok: false', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: false, error: 'invalid payload' },
      error: null,
    });

    await expect(exportToSupabase(sampleExport)).rejects.toThrow(/invalid payload/);
  });
});
