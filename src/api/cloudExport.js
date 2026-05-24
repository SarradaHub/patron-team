import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

/**
 * Sends IndexedDB export payload to Supabase via export-snapshot Edge Function.
 * @param {object} data — result of exportData() (schema v3)
 * @returns {Promise<{ batchId?: string, duplicate?: boolean, counts?: Record<string, number> }>}
 */
export async function exportToSupabase(data) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error(
      'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  const exportId = crypto.randomUUID();
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

  return result ?? { ok: true };
}
