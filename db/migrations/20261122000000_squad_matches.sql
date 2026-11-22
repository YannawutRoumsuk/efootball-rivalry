-- =============================================================================
-- PvP 3v3 ("squad") matches: up to three group members on the same team.
-- The game shows a per-player stats table over several screenshots; the app
-- reads them, the uploader confirms, and one row per column is stored.
--   * Stats live in a jsonb object per column (keys validated by the app and
--     by squad_valid_stats() below) — the game's table has ~33 numbers.
--   * A column may be a stranger who filled the third seat: player_id null.
--   * squad_aliases remembers which in-game name belongs to which member.
-- Writes go through SECURITY DEFINER RPCs; members get SELECT only.
-- =============================================================================

create table public.squad_matches (
  id            uuid primary key default gen_random_uuid(),
  rivalry_id    uuid not null references public.rivalries (id) on delete cascade,
  played_at     timestamptz,
  team_name     text check (team_name is null or char_length(team_name) <= 60),
  goals_for     integer check (goals_for between 0 and 99),
  goals_against integer check (goals_against between 0 and 99),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index squad_matches_rivalry_idx on public.squad_matches (rivalry_id, played_at);

create or replace function public.squad_valid_stats(p_stats jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_stats) = 'object'
     and not exists (
       select 1 from jsonb_each(p_stats) e
       where e.key !~ '^[a-z_]{1,40}$'
          or not (
            case jsonb_typeof(e.value)
              when 'null' then true
              when 'number' then (e.value)::numeric between 0 and 99999 and (e.value)::numeric = trunc((e.value)::numeric)
              else false
            end
          )
     )
$$;

create table public.squad_match_players (
  squad_match_id uuid not null references public.squad_matches (id) on delete cascade,
  slot           smallint not null check (slot between 1 and 3),
  player_id      uuid references public.profiles (id),
  ingame_name    text check (ingame_name is null or char_length(ingame_name) <= 60),
  stats          jsonb not null default '{}'::jsonb check (public.squad_valid_stats(stats)),
  primary key (squad_match_id, slot),
  constraint squad_match_players_distinct unique (squad_match_id, player_id)
);
create index squad_match_players_player_idx on public.squad_match_players (player_id);

create table public.squad_uploads (
  id             uuid primary key default gen_random_uuid(),
  rivalry_id     uuid not null references public.rivalries (id) on delete cascade,
  squad_match_id uuid references public.squad_matches (id) on delete set null,
  uploaded_by    uuid not null references public.profiles (id),
  storage_path   text not null unique,
  image_hash     text not null check (image_hash ~ '^[0-9a-f]{64}$'),
  mime_type      text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes     integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  extraction_json jsonb,
  created_at     timestamptz not null default now(),
  constraint squad_uploads_path_in_rivalry check (storage_path like rivalry_id::text || '/%')
);
create index squad_uploads_match_idx on public.squad_uploads (squad_match_id);
create index squad_uploads_rivalry_hash_idx on public.squad_uploads (rivalry_id, image_hash);

create table public.squad_aliases (
  rivalry_id  uuid not null references public.rivalries (id) on delete cascade,
  -- Folded form of the name (lower-case letters/digits) so OCR variants collide.
  name_key    text not null check (name_key ~ '^[a-z0-9]{1,60}$'),
  ingame_name text not null check (char_length(ingame_name) between 1 and 60),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  updated_at  timestamptz not null default now(),
  primary key (rivalry_id, name_key)
);

alter table public.squad_matches       enable row level security;
alter table public.squad_match_players enable row level security;
alter table public.squad_uploads       enable row level security;
alter table public.squad_aliases       enable row level security;

create policy "squad_matches: members read"
  on public.squad_matches for select to authenticated
  using (public.is_rivalry_member(rivalry_id));

create policy "squad_match_players: members read"
  on public.squad_match_players for select to authenticated
  using (exists (
    select 1 from public.squad_matches m
    where m.id = squad_match_players.squad_match_id and public.is_rivalry_member(m.rivalry_id)
  ));

create policy "squad_uploads: members read"
  on public.squad_uploads for select to authenticated
  using (public.is_rivalry_member(rivalry_id));

create policy "squad_uploads: members insert own"
  on public.squad_uploads for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and squad_match_id is null
    and public.is_rivalry_member(rivalry_id)
  );

create policy "squad_uploads: uploader updates extraction"
  on public.squad_uploads for update to authenticated
  using (uploaded_by = (select auth.uid()) and public.is_rivalry_member(rivalry_id) and squad_match_id is null)
  with check (uploaded_by = (select auth.uid()) and public.is_rivalry_member(rivalry_id) and squad_match_id is null);

create policy "squad_aliases: members read"
  on public.squad_aliases for select to authenticated
  using (public.is_rivalry_member(rivalry_id));

revoke all on public.squad_matches, public.squad_match_players, public.squad_uploads, public.squad_aliases
  from anon, authenticated;
grant select on public.squad_matches, public.squad_match_players, public.squad_uploads, public.squad_aliases
  to authenticated;
grant insert (rivalry_id, uploaded_by, storage_path, image_hash, mime_type, size_bytes)
  on public.squad_uploads to authenticated;
grant update (extraction_json) on public.squad_uploads to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

create or replace function public.is_rivalry_owner(p_rivalry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rivalry_members
    where rivalry_id = p_rivalry_id and user_id = (select auth.uid()) and role = 'owner'
  )
$$;

/*
 * Creates (p_match_id null) or replaces a squad match. p_players is an array of
 * {slot, player_id, ingame_name, stats}. Members create; only the owner may
 * change a saved match (who is in which column, any number). Uploads in
 * p_upload_ids are attached to the match. Learns in-game names → players.
 */
create or replace function public.save_squad_match(
  p_rivalry_id uuid,
  p_match_id uuid,
  p_match jsonb,
  p_players jsonb,
  p_upload_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_id uuid := p_match_id;
  v_members integer;
  v_bad integer;
begin
  if not public.is_rivalry_member(p_rivalry_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) not between 1 and 3 then
    raise exception 'INVALID_SQUAD' using errcode = 'P0001';
  end if;

  select count(*) filter (where (p ->> 'player_id') is not null),
         count(*) filter (where (p ->> 'player_id') is not null and not exists (
           select 1 from public.rivalry_members rm
           where rm.rivalry_id = p_rivalry_id and rm.user_id = public.try_uuid(p ->> 'player_id')
         ))
    into v_members, v_bad
  from jsonb_array_elements(p_players) p;
  if v_members < 2 then
    raise exception 'INVALID_SQUAD' using errcode = 'P0001', hint = 'At least two group members.';
  end if;
  if v_bad > 0 then
    raise exception 'PLAYER_NOT_IN_RIVALRY' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.squad_matches (rivalry_id, played_at, team_name, goals_for, goals_against, created_by)
    values (
      p_rivalry_id,
      (p_match ->> 'played_at')::timestamptz,
      nullif(btrim(p_match ->> 'team_name'), ''),
      (p_match ->> 'goals_for')::integer,
      (p_match ->> 'goals_against')::integer,
      v_uid
    )
    returning id into v_id;
  else
    if not public.is_rivalry_owner(p_rivalry_id) then
      raise exception 'OWNER_ONLY' using errcode = 'P0001';
    end if;
    update public.squad_matches m set
      played_at = (p_match ->> 'played_at')::timestamptz,
      team_name = nullif(btrim(p_match ->> 'team_name'), ''),
      goals_for = (p_match ->> 'goals_for')::integer,
      goals_against = (p_match ->> 'goals_against')::integer,
      updated_at = now()
    where m.id = v_id and m.rivalry_id = p_rivalry_id;
    if not found then
      raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
    end if;
    delete from public.squad_match_players where squad_match_id = v_id;
  end if;

  insert into public.squad_match_players (squad_match_id, slot, player_id, ingame_name, stats)
  select v_id, (p ->> 'slot')::smallint, public.try_uuid(p ->> 'player_id'),
         nullif(btrim(p ->> 'ingame_name'), ''), coalesce(p -> 'stats', '{}'::jsonb)
  from jsonb_array_elements(p_players) p;

  -- Remember in-game names. A new name is learned from anyone; re-pointing a
  -- known name to someone else is the owner's call.
  insert into public.squad_aliases (rivalry_id, name_key, ingame_name, player_id)
  select p_rivalry_id, k.name_key, k.ingame_name, k.player_id
  from (
    select distinct on (name_key) name_key, ingame_name, player_id
    from (
      select lower(regexp_replace(translate(btrim(p ->> 'ingame_name'), 'OoIiLl', '001111'), '[^A-Za-z0-9]', '', 'g')) as name_key,
             btrim(p ->> 'ingame_name') as ingame_name,
             public.try_uuid(p ->> 'player_id') as player_id
      from jsonb_array_elements(p_players) p
    ) x
    where player_id is not null and name_key ~ '^[a-z0-9]{1,60}$'
  ) k
  on conflict (rivalry_id, name_key) do update
    set player_id = excluded.player_id, ingame_name = excluded.ingame_name, updated_at = now()
    where public.is_rivalry_owner(p_rivalry_id);

  if coalesce(array_length(p_upload_ids, 1), 0) > 0 then
    update public.squad_uploads u set squad_match_id = v_id
    where u.id = any (p_upload_ids) and u.rivalry_id = p_rivalry_id and u.squad_match_id is null;
  end if;

  return v_id;
end;
$$;

/* Owner-only hard delete; returns the screenshots' storage paths so the app can remove the files. */
create or replace function public.delete_squad_match(p_match_id uuid)
returns table (deleted_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rivalry_id uuid;
begin
  perform public.require_user();
  select m.rivalry_id into v_rivalry_id from public.squad_matches m where m.id = p_match_id;
  if not found or not public.is_rivalry_member(v_rivalry_id) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not public.is_rivalry_owner(v_rivalry_id) then
    raise exception 'OWNER_ONLY' using errcode = 'P0001';
  end if;
  return query delete from public.squad_uploads u where u.squad_match_id = p_match_id returning u.storage_path;
  delete from public.squad_matches m where m.id = p_match_id;
end;
$$;

/* Owner-only: point an in-game name at a member (or forget it with p_player_id null). */
create or replace function public.set_squad_alias(p_rivalry_id uuid, p_name text, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := lower(regexp_replace(translate(btrim(coalesce(p_name, '')), 'OoIiLl', '001111'), '[^A-Za-z0-9]', '', 'g'));
begin
  perform public.require_user();
  if not public.is_rivalry_owner(p_rivalry_id) then
    raise exception 'OWNER_ONLY' using errcode = 'P0001';
  end if;
  if v_key !~ '^[a-z0-9]{1,60}$' then
    raise exception 'INVALID_ALIAS' using errcode = 'P0001';
  end if;
  if p_player_id is null then
    delete from public.squad_aliases where rivalry_id = p_rivalry_id and name_key = v_key;
    return;
  end if;
  if not exists (select 1 from public.rivalry_members where rivalry_id = p_rivalry_id and user_id = p_player_id) then
    raise exception 'PLAYER_NOT_IN_RIVALRY' using errcode = 'P0001';
  end if;
  insert into public.squad_aliases (rivalry_id, name_key, ingame_name, player_id)
  values (p_rivalry_id, v_key, left(btrim(p_name), 60), p_player_id)
  on conflict (rivalry_id, name_key) do update
    set player_id = excluded.player_id, ingame_name = excluded.ingame_name, updated_at = now();
end;
$$;

revoke execute on function public.squad_valid_stats(jsonb) from public, anon;
revoke execute on function public.is_rivalry_owner(uuid) from public, anon;
revoke execute on function public.save_squad_match(uuid, uuid, jsonb, jsonb, uuid[]) from public, anon;
revoke execute on function public.delete_squad_match(uuid) from public, anon;
revoke execute on function public.set_squad_alias(uuid, text, uuid) from public, anon;
grant execute on function public.squad_valid_stats(jsonb) to authenticated;
grant execute on function public.is_rivalry_owner(uuid) to authenticated;
grant execute on function public.save_squad_match(uuid, uuid, jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.delete_squad_match(uuid) to authenticated;
grant execute on function public.set_squad_alias(uuid, text, uuid) to authenticated;
