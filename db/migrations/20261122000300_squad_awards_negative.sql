-- =============================================================================
-- 1) Evaluation points can be negative in the game ("Dribbling -23"): the seven
--    rating keys may now be -99999…99999; every count still starts at 0.
-- 2) Co-op Awards: each column keeps its titles from the awards screen, e.g.
--    [{"title": "The Architect", "tier": "gold"}], tier gold/silver/bronze.
-- =============================================================================

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
              -- Only the evaluation points may go below zero; counts never do.
              when 'number' then (e.value)::numeric = trunc((e.value)::numeric)
                and (e.value)::numeric <= 99999
                and (e.value)::numeric >= case when e.key in ('total_points', 'offensive_positioning', 'shooting', 'dueling',
                                                             'defensive_positioning', 'passing', 'dribbling') then -99999 else 0 end
              else false
            end
          )
     )
$$;

create or replace function public.squad_valid_awards(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- CASE guards each step: AND gives no evaluation order, and the array/object
  -- functions raise on the wrong JSON type instead of failing the check.
  select case
    when jsonb_typeof(p) is distinct from 'array' then false
    when jsonb_array_length(p) > 6 then false
    else not exists (
      select 1 from jsonb_array_elements(p) a
      where case
        when jsonb_typeof(a) <> 'object' then true
        when exists (select 1 from jsonb_object_keys(a) k where k not in ('title', 'tier')) then true
        when jsonb_typeof(a -> 'title') is distinct from 'string' then true
        when char_length(btrim(a ->> 'title')) not between 1 and 40 then true
        else coalesce(a ->> 'tier', '') not in ('gold', 'silver', 'bronze')
      end
    )
  end
$$;

revoke execute on function public.squad_valid_awards(jsonb) from public, anon;
grant execute on function public.squad_valid_awards(jsonb) to authenticated;

alter table public.squad_match_players
  add column if not exists awards jsonb not null default '[]'::jsonb check (public.squad_valid_awards(awards));

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

  insert into public.squad_match_players (squad_match_id, slot, player_id, ingame_name, stats, awards)
  select v_id, (p ->> 'slot')::smallint, public.try_uuid(p ->> 'player_id'),
         nullif(btrim(p ->> 'ingame_name'), ''), coalesce(p -> 'stats', '{}'::jsonb),
         case when jsonb_typeof(p -> 'awards') = 'array' then p -> 'awards' else '[]'::jsonb end
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
