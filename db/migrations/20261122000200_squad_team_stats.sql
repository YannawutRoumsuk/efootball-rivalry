-- =============================================================================
-- 3v3 matches also get the "Full Time" score screen (same layout as 1v1):
-- team-level stats for our team ("us") and the opponents ("them"), plus the
-- opponent's name. Stored as {"us": {...}, "them": {...}} with the 1v1 stat
-- keys (possession_pct, shots, …, penalties).
-- Also: purge_stale_uploads() removes screenshots that were uploaded but never
-- saved as a match (1v1 and 3v3), so the volume doesn't fill up with drafts.
-- =============================================================================

create or replace function public.squad_valid_team_stats(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in ('us', 'them'))
    and public.squad_valid_stats(coalesce(p -> 'us', '{}'::jsonb))
    and public.squad_valid_stats(coalesce(p -> 'them', '{}'::jsonb))
  )
$$;

alter table public.squad_matches
  add column if not exists team_stats jsonb check (public.squad_valid_team_stats(team_stats)),
  add column if not exists opponent_name text check (opponent_name is null or char_length(opponent_name) <= 60);

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
  v_team jsonb := case when jsonb_typeof(p_match -> 'team_stats') = 'object' then p_match -> 'team_stats' else null end;
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
    insert into public.squad_matches (rivalry_id, played_at, team_name, opponent_name, goals_for, goals_against, team_stats, created_by)
    values (
      p_rivalry_id,
      (p_match ->> 'played_at')::timestamptz,
      nullif(btrim(p_match ->> 'team_name'), ''),
      nullif(btrim(p_match ->> 'opponent_name'), ''),
      (p_match ->> 'goals_for')::integer,
      (p_match ->> 'goals_against')::integer,
      v_team,
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
      opponent_name = nullif(btrim(p_match ->> 'opponent_name'), ''),
      goals_for = (p_match ->> 'goals_for')::integer,
      goals_against = (p_match ->> 'goals_against')::integer,
      team_stats = v_team,
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

/*
 * Server maintenance (owner role only): deletes uploads never attached to a
 * match that are older than p_hours, and returns their storage paths so the
 * app can delete the files.
 */
create or replace function public.purge_stale_uploads(p_hours integer default 24)
returns table (storage_path text)
language sql
set search_path = ''
as $$
  with squad as (
    delete from public.squad_uploads u
    where u.squad_match_id is null and u.created_at < now() - make_interval(hours => greatest(p_hours, 1))
    returning u.storage_path
  ), solo as (
    delete from public.match_uploads u
    where u.match_id is null and u.created_at < now() - make_interval(hours => greatest(p_hours, 1))
    returning u.storage_path
  )
  select storage_path from squad
  union all
  select storage_path from solo
$$;

revoke execute on function public.squad_valid_team_stats(jsonb) from public, anon;
grant execute on function public.squad_valid_team_stats(jsonb) to authenticated;
revoke execute on function public.purge_stale_uploads(integer) from public, anon, authenticated;

-- Mock Full Time screen for the first match (BVB): the screenshot wasn't kept,
-- so these team stats are an assumed 3–0 win (our goals and shots add up to the
-- players' own numbers). Correct them from the match page if the real screen
-- turns up.
do $$
declare
  v_n integer;
begin
  update public.squad_matches set
    opponent_name = coalesce(opponent_name, 'Opponent'),
    goals_for = coalesce(goals_for, 3),
    goals_against = coalesce(goals_against, 0),
    team_stats = '{"us": {"possession_pct": 54, "shots": 5, "shots_on_target": 4, "fouls": 1, "offsides": 0, "corners": 2, "free_kicks": 1, "passes": 53, "successful_passes": 36, "crosses": 2, "interceptions": 35, "tackles": 7, "saves": 1}, "them": {"possession_pct": 46, "shots": 4, "shots_on_target": 1, "fouls": 2, "offsides": 1, "corners": 1, "free_kicks": 2, "passes": 61, "successful_passes": 44, "crosses": 3, "interceptions": 28, "tackles": 9, "saves": 1}}'::jsonb
  where team_name = 'BVB' and played_at = '2026-11-22T12:00:00Z' and team_stats is null;
  get diagnostics v_n = row_count;
  raise notice '[squad] mock Full Time stats applied to % BVB match(es); 3v3 matches in total: %', v_n, (select count(*) from public.squad_matches);
end;
$$;
