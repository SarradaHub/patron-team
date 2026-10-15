import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

const PENDING_EXPORT_KEY = 'patron-team-pending-export';

function snapshotKey(data) {
  return JSON.stringify({
    schemaVersion: data.schemaVersion,
    exportedAt: data.exportedAt,
    players: data.players ?? [],
    teams: data.teams ?? [],
    matches: data.matches ?? [],
    rounds: data.rounds ?? [],
    meta: data.meta ?? [],
    player_stats: data.player_stats ?? [],
  });
}

function exportIdForSnapshot(data) {
  const key = snapshotKey(data);
  const raw = sessionStorage.getItem(PENDING_EXPORT_KEY);
  if (raw) {
    try {
      const stored = JSON.parse(raw);
      if (stored?.snapshotKey === key && typeof stored.exportId === 'string') {
        return stored.exportId;
      }
    } catch {
      // Replace a value this tab cannot read.
    }
  }
  const exportId = crypto.randomUUID();
  sessionStorage.setItem(PENDING_EXPORT_KEY, JSON.stringify({ snapshotKey: key, exportId }));
  return exportId;
}

let inFlight = null;

/**
 * Sends IndexedDB export payload to Supabase via export-snapshot Edge Function.
 * A second call while one send is in flight returns that same send.
 * @param {object} data — result of exportData() (schema v3)
 * @returns {Promise<{ batchId?: string, duplicate?: boolean, counts?: Record<string, number> }>}
 */
export function exportToSupabase(data) {
  if (!isSupabaseConfigured() || !supabase) {
    return Promise.reject(
      new Error(
        'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.'
      )
    );
  }

  if (inFlight) return inFlight;

  inFlight = sendSnapshot(data).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function sendSnapshot(data) {
  const exportId = exportIdForSnapshot(data);
  const body = {
    exportId,
    schemaVersion: data.schemaVersion,
    exportedAt: data.exportedAt,
    players: data.players ?? [],
    teams: data.teams ?? [],
    matches: data.matches ?? [],
    rounds: data.rounds ?? [],
    meta: data.meta ?? [],
    player_stats: data.player_stats ?? [],
  };

  const { data: result, error } = await supabase.functions.invoke('export-snapshot', {
    body,
  });

  if (error) {
    console.error('exportToSupabase invoke error:', error);
    throw new Error(error.message || 'Falha ao enviar dados para Supabase.');
  }

  if (result && typeof result === 'object' && result.ok === false) {
    const msg = result.error || 'Falha ao exportar para Supabase.';
    console.error('exportToSupabase function error:', result);
    throw new Error(String(msg));
  }

  sessionStorage.removeItem(PENDING_EXPORT_KEY);
  return result ?? { ok: true };
}
