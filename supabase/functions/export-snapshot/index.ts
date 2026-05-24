import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const CHUNK_SIZE = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ExportPayload = {
  exportId: string;
  schemaVersion: number;
  exportedAt: string;
  players: Record<string, unknown>[];
  teams: Record<string, unknown>[];
  matches: Record<string, unknown>[];
  rounds: Record<string, unknown>[];
  meta: Record<string, unknown>[];
  player_stats: Record<string, unknown>[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseTimestamp(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapRounds(batchId: string, rounds: Record<string, unknown>[]) {
  return rounds.map((r) => ({
    export_batch_id: batchId,
    id: r.id,
    name: r.name,
    created_at: parseTimestamp(r.createdAt),
    updated_at: parseTimestamp(r.updatedAt),
    status: r.status ?? null,
  }));
}

function mapPlayers(batchId: string, players: Record<string, unknown>[]) {
  return players.map((p) => ({
    export_batch_id: batchId,
    id: p.id,
    name: p.name,
    status: p.status ?? null,
    joined_at: parseTimestamp(p.joinedAt),
    goals: Number(p.goals) || 0,
    assists: Number(p.assists) || 0,
    prefer_goalkeeper: Boolean(p.preferGoalkeeper),
    goalkeeper_only: Boolean(p.goalkeeperOnly),
  }));
}

function mapTeams(batchId: string, teams: Record<string, unknown>[]) {
  return teams.map((t) => ({
    export_batch_id: batchId,
    id: t.id,
    round_id: t.roundId ?? null,
    status: t.status ?? null,
    is_blocked: Boolean(t.isBlocked),
    display_name: t.displayName ?? null,
    created_at: parseTimestamp(t.createdAt),
    entered_waiting_at: parseTimestamp(t.enteredWaitingAt),
    waiting_order: t.waitingOrder != null ? Number(t.waitingOrder) : null,
    players: t.players ?? [],
  }));
}

function mapMatches(batchId: string, matches: Record<string, unknown>[]) {
  return matches.map((m) => ({
    export_batch_id: batchId,
    id: m.id,
    round_id: m.roundId ?? null,
    team_a: m.teamA ?? null,
    team_b: m.teamB ?? null,
    result: m.result ?? null,
    status: m.status ?? null,
    draw: Boolean(m.draw),
    winning_team_id: m.winningTeamId ?? null,
    timestamp: parseTimestamp(m.timestamp),
    timer_duration_minutes:
      m.timerDurationMinutes != null ? Number(m.timerDurationMinutes) : null,
    countdown_ends_at: parseTimestamp(m.countdownEndsAt),
    roster_a: m.rosterA ?? [],
    roster_b: m.rosterB ?? [],
  }));
}

function mapMeta(batchId: string, meta: Record<string, unknown>[]) {
  return meta.map((row) => ({
    export_batch_id: batchId,
    key: String(row.key),
    value: row.value ?? null,
  }));
}

function mapPlayerStats(batchId: string, stats: Record<string, unknown>[]) {
  return stats.map((s) => ({
    export_batch_id: batchId,
    id: String(s.id),
    round_id: s.roundId ?? null,
    match_id: s.matchId ?? null,
    team_id: s.teamId ?? null,
    player_id: s.playerId ?? null,
    goals: Number(s.goals) || 0,
    assists: Number(s.assists) || 0,
    own_goals: Number(s.ownGoals) || 0,
    was_goalkeeper: Boolean(s.wasGoalkeeper),
  }));
}

async function insertInChunks(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: Record<string, unknown>[]
) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

function validatePayload(body: unknown): ExportPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.exportId !== 'string' || !b.exportId) return null;
  if (typeof b.schemaVersion !== 'number') return null;
  if (typeof b.exportedAt !== 'string' || !b.exportedAt) return null;
  const arrays = ['players', 'teams', 'matches', 'rounds', 'meta', 'player_stats'] as const;
  for (const key of arrays) {
    if (!Array.isArray(b[key])) return null;
  }
  return body as ExportPayload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'server misconfigured' }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid json body' }, 400);
  }

  const payload = validatePayload(body);
  if (!payload) {
    return jsonResponse(
      {
        ok: false,
        error:
          'invalid payload: exportId, schemaVersion, exportedAt and entity arrays required',
      },
      400
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: lookupError } = await supabase
    .from('export_batches')
    .select('id')
    .eq('export_id', payload.exportId)
    .maybeSingle();

  if (lookupError) {
    console.error('export_batches lookup:', lookupError);
    return jsonResponse({ ok: false, error: lookupError.message }, 500);
  }

  if (existing) {
    return jsonResponse({ ok: true, duplicate: true, batchId: existing.id });
  }

  const exportedAt = parseTimestamp(payload.exportedAt);
  if (!exportedAt) {
    return jsonResponse({ ok: false, error: 'invalid exportedAt' }, 400);
  }

  const { data: batch, error: batchError } = await supabase
    .from('export_batches')
    .insert({
      export_id: payload.exportId,
      schema_version: payload.schemaVersion,
      exported_at: exportedAt,
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    console.error('export_batches insert:', batchError);
    return jsonResponse({ ok: false, error: batchError?.message ?? 'batch insert failed' }, 500);
  }

  const batchId = batch.id as string;

  try {
    await insertInChunks(supabase, 'export_rounds', mapRounds(batchId, payload.rounds));
    await insertInChunks(supabase, 'export_players', mapPlayers(batchId, payload.players));
    await insertInChunks(supabase, 'export_teams', mapTeams(batchId, payload.teams));
    await insertInChunks(supabase, 'export_matches', mapMatches(batchId, payload.matches));
    await insertInChunks(supabase, 'export_meta', mapMeta(batchId, payload.meta));
    await insertInChunks(
      supabase,
      'export_player_stats',
      mapPlayerStats(batchId, payload.player_stats)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('entity insert failed, cleaning batch:', batchId, err);
    await supabase.from('export_batches').delete().eq('id', batchId);
    return jsonResponse({ ok: false, error: message }, 500);
  }

  return jsonResponse({
    ok: true,
    duplicate: false,
    batchId,
    counts: {
      rounds: payload.rounds.length,
      players: payload.players.length,
      teams: payload.teams.length,
      matches: payload.matches.length,
      meta: payload.meta.length,
      player_stats: payload.player_stats.length,
    },
  });
});
