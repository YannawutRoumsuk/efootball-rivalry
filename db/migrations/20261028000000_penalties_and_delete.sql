-- =============================================================================
-- 1) Penalty shoot-outs: each side stores its shoot-out goals ("6 PK 7").
--    The app treats a level score decided on penalties as a win for the
--    shoot-out winner. Null = no shoot-out (every existing match).
-- 2) Hard delete of a match by the group owner (seat 1 / PLAYER_1_PIN).
-- =============================================================================

alter table public.match_sides
  add column if not exists penalties integer check (penalties between 0 and 50);

create or replace function public.insert_match_sides(p_match_id uuid, p_sides jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.match_sides (
    match_id, player_id, screen_side, onscreen_label, team_name, goals, penalties, possession_pct,
    shots, shots_on_target, fouls, offsides, corners, free_kicks, passes,
    successful_passes, crosses, interceptions, tackles, saves
  )
  select
    p_match_id, s.player_id, s.screen_side, nullif(btrim(s.onscreen_label), ''),
    nullif(btrim(s.team_name), ''), s.goals, s.penalties, s.possession_pct, s.shots, s.shots_on_target,
    s.fouls, s.offsides, s.corners, s.free_kicks, s.passes, s.successful_passes, s.crosses,
    s.interceptions, s.tackles, s.saves
  from jsonb_to_recordset(p_sides) as s (
    player_id uuid, screen_side text, onscreen_label text, team_name text, goals integer,
    penalties integer, possession_pct numeric, shots integer, shots_on_target integer, fouls integer,
    offsides integer, corners integer, free_kicks integer, passes integer,
    successful_passes integer, crosses integer, interceptions integer, tackles integer,
    saves integer
  );
$$;

revoke execute on function public.insert_match_sides(uuid, jsonb) from public, anon, authenticated;

-- Permanently removes a match: its sides and audit events (cascade) and its
-- screenshot rows. Later matches move up one number so the sequence stays
-- contiguous; every table and rating is computed from what remains. Returns
-- the deleted screenshots' storage paths so the app can remove the files.
create or replace function public.delete_match(p_match_id uuid)
returns table (deleted_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_rivalry_id uuid;
  v_match public.matches%rowtype;
begin
  select m.rivalry_id into v_rivalry_id from public.matches m where m.id = p_match_id;
  if not found or not public.is_rivalry_member(v_rivalry_id) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.rivalry_members rm
    where rm.rivalry_id = v_rivalry_id and rm.user_id = v_uid and rm.role = 'owner'
  ) then
    raise exception 'OWNER_ONLY' using errcode = 'P0001';
  end if;

  -- Serialise with numbering changes in the same group, then re-read the
  -- match under a row lock so match_no can't be stale (a concurrent create
  -- or move may have renumbered it while we waited).
  perform 1 from public.rivalries where id = v_rivalry_id for update;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  return query
    delete from public.match_uploads u where u.match_id = p_match_id returning u.storage_path;
  delete from public.matches m where m.id = p_match_id;
  update public.matches m set match_no = m.match_no - 1
  where m.rivalry_id = v_match.rivalry_id and m.match_no > v_match.match_no;
end;
$$;

revoke execute on function public.delete_match(uuid) from public, anon;
grant execute on function public.delete_match(uuid) to authenticated;
