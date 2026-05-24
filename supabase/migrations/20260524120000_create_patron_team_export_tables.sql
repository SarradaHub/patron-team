-- patron-team (Arjen Queue) cloud export snapshot tables
-- one export_batch row per user export; entity rows scoped by export_batch_id
-- writes happen only via export-snapshot edge function (service role); rls enabled, no public policies

-- ---------------------------------------------------------------------------
-- export_batches: metadata for each export attempt (idempotent via export_id)
-- ---------------------------------------------------------------------------
create table if not exists public.export_batches (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null unique,
  schema_version integer not null,
  exported_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.export_batches is 'one row per patron-team export to supabase';
comment on column public.export_batches.export_id is 'client-generated uuid for idempotent retries';

create index if not exists export_batches_exported_at_idx on public.export_batches (exported_at desc);

-- ---------------------------------------------------------------------------
-- export_rounds
-- ---------------------------------------------------------------------------
create table if not exists public.export_rounds (
  export_batch_id uuid not null references public.export_batches (id) on delete cascade,
  id uuid not null,
  name text not null,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  primary key (export_batch_id, id)
);

comment on table public.export_rounds is 'snapshot of indexeddb rounds store per export';

create index if not exists export_rounds_batch_idx on public.export_rounds (export_batch_id);

-- ---------------------------------------------------------------------------
-- export_players
-- ---------------------------------------------------------------------------
create table if not exists public.export_players (
  export_batch_id uuid not null references public.export_batches (id) on delete cascade,
  id uuid not null,
  name text not null,
  status text,
  joined_at timestamptz,
  goals integer default 0,
  assists integer default 0,
  prefer_goalkeeper boolean default false,
  goalkeeper_only boolean default false,
  primary key (export_batch_id, id)
);

comment on table public.export_players is 'snapshot of indexeddb players store per export';

create index if not exists export_players_batch_idx on public.export_players (export_batch_id);

-- ---------------------------------------------------------------------------
-- export_teams
-- ---------------------------------------------------------------------------
create table if not exists public.export_teams (
  export_batch_id uuid not null references public.export_batches (id) on delete cascade,
  id uuid not null,
  round_id uuid,
  status text,
  is_blocked boolean default false,
  display_name text,
  created_at timestamptz,
  entered_waiting_at timestamptz,
  waiting_order integer,
  players jsonb default '[]'::jsonb,
  primary key (export_batch_id, id)
);

comment on table public.export_teams is 'snapshot of indexeddb teams store per export';
comment on column public.export_teams.players is 'player id array as jsonb, matches indexeddb';

create index if not exists export_teams_batch_idx on public.export_teams (export_batch_id);

-- ---------------------------------------------------------------------------
-- export_matches
-- ---------------------------------------------------------------------------
create table if not exists public.export_matches (
  export_batch_id uuid not null references public.export_batches (id) on delete cascade,
  id uuid not null,
  round_id uuid,
  team_a uuid,
  team_b uuid,
  result text,
  status text,
  draw boolean default false,
  winning_team_id uuid,
  timestamp timestamptz,
  timer_duration_minutes integer,
  countdown_ends_at timestamptz,
  roster_a jsonb default '[]'::jsonb,
  roster_b jsonb default '[]'::jsonb,
  primary key (export_batch_id, id)
);

comment on table public.export_matches is 'snapshot of indexeddb matches store per export';

create index if not exists export_matches_batch_idx on public.export_matches (export_batch_id);

-- ---------------------------------------------------------------------------
-- export_meta (key/value rows from indexeddb meta store)
-- ---------------------------------------------------------------------------
create table if not exists public.export_meta (
  export_batch_id uuid not null references public.export_batches (id) on delete cascade,
  key text not null,
  value jsonb,
  primary key (export_batch_id, key)
);

comment on table public.export_meta is 'snapshot of indexeddb meta store per export';

create index if not exists export_meta_batch_idx on public.export_meta (export_batch_id);

-- ---------------------------------------------------------------------------
-- export_player_stats
-- ---------------------------------------------------------------------------
create table if not exists public.export_player_stats (
  export_batch_id uuid not null references public.export_batches (id) on delete cascade,
  id text not null,
  round_id uuid,
  match_id uuid,
  team_id uuid,
  player_id uuid,
  goals integer default 0,
  assists integer default 0,
  own_goals integer default 0,
  was_goalkeeper boolean default false,
  primary key (export_batch_id, id)
);

comment on table public.export_player_stats is 'snapshot of indexeddb player_stats store per export';

create index if not exists export_player_stats_batch_idx on public.export_player_stats (export_batch_id);

-- ---------------------------------------------------------------------------
-- row level security: enabled on all tables; no anon/authenticated policies
-- edge function uses service_role to insert
-- ---------------------------------------------------------------------------
alter table public.export_batches enable row level security;
alter table public.export_rounds enable row level security;
alter table public.export_players enable row level security;
alter table public.export_teams enable row level security;
alter table public.export_matches enable row level security;
alter table public.export_meta enable row level security;
alter table public.export_player_stats enable row level security;
