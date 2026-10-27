-- Trivial Trials schema
-- Public game state lives in `games` (readable by anyone with the anon key, streamed via Realtime).
-- Answers, the question deck and auth token hashes live in `game_secrets` (service role only).

create table if not exists public.games (
  code        text primary key,
  state       jsonb       not null,
  version     integer     not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.game_secrets (
  code     text primary key references public.games(code) on delete cascade,
  secrets  jsonb not null,
  auth     jsonb not null
);

-- Hourly cleanup scans by last activity.
create index if not exists games_updated_at_idx on public.games (updated_at);

alter table public.games enable row level security;
alter table public.game_secrets enable row level security;

drop policy if exists "games are publicly readable" on public.games;
create policy "games are publicly readable" on public.games
  for select to anon, authenticated using (true);
-- No policies on game_secrets: only the service role (Netlify Functions) can touch it.

-- Stream row changes to subscribed clients.
alter table public.games replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;

-- Atomic read of a game and its secrets.
create or replace function public.load_game(p_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'state', g.state,
    'version', g.version,
    'secrets', s.secrets,
    'auth', s.auth
  )
  from games g join game_secrets s on s.code = g.code
  where g.code = p_code;
$$;

-- Atomic write with optimistic concurrency. Returns the new version, or null on conflict.
create or replace function public.save_game(
  p_code text,
  p_expected_version integer,
  p_state jsonb,
  p_secrets jsonb,
  p_auth jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_version integer;
begin
  update games
     set state = p_state,
         version = version + 1,
         updated_at = now()
   where code = p_code and version = p_expected_version
  returning version into new_version;

  if new_version is null then
    return null;
  end if;

  update game_secrets set secrets = p_secrets, auth = p_auth where code = p_code;
  return new_version;
end;
$$;

-- Create a game; returns false if the code is already taken.
create or replace function public.create_game(
  p_code text,
  p_state jsonb,
  p_secrets jsonb,
  p_auth jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into games (code, state) values (p_code, p_state);
  insert into game_secrets (code, secrets, auth) values (p_code, p_secrets, p_auth);
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.cleanup_games(p_idle_minutes integer)
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from games where updated_at < now() - make_interval(mins => p_idle_minutes) returning 1
  )
  select count(*)::integer from deleted;
$$;

-- Explicit grants, so this works even with "Automatically expose new tables" turned off.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.games to anon, authenticated;
grant all on public.games, public.game_secrets to service_role;
revoke all on public.game_secrets from anon, authenticated;

revoke all on function public.load_game(text) from public, anon, authenticated;
revoke all on function public.save_game(text, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_game(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.cleanup_games(integer) from public, anon, authenticated;

grant execute on function public.load_game(text) to service_role;
grant execute on function public.save_game(text, integer, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.create_game(text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.cleanup_games(integer) to service_role;
