-- =============================================================================
-- Data: the group's first 3v3 match (BVB, 3–0, 2026-11-22), read from six
-- screenshots and checked by hand. In-game names: WyNM = M, Do3minicT0rett0 =
-- DOM, bigverx = Big. Inserted only when the roster has players named M, DOM
-- and Big (case-insensitive) and the match isn't there yet; otherwise skipped,
-- so it is a no-op on fresh or differently named databases.
-- =============================================================================

do $$
declare
  v_rivalry uuid;
  v_owner uuid;
  v_m uuid;
  v_dom uuid;
  v_big uuid;
  v_id uuid;
begin
  select id into v_rivalry from public.rivalries order by created_at limit 1;
  if v_rivalry is null then
    return;
  end if;
  select user_id into v_owner from public.rivalry_members where rivalry_id = v_rivalry and role = 'owner' limit 1;
  select p.id into v_m from public.rivalry_members rm join public.profiles p on p.id = rm.user_id
    where rm.rivalry_id = v_rivalry and lower(btrim(p.display_name)) in ('m', 'wynm') limit 1;
  select p.id into v_dom from public.rivalry_members rm join public.profiles p on p.id = rm.user_id
    where rm.rivalry_id = v_rivalry and lower(btrim(p.display_name)) in ('dom', 'dominic') limit 1;
  select p.id into v_big from public.rivalry_members rm join public.profiles p on p.id = rm.user_id
    where rm.rivalry_id = v_rivalry and lower(btrim(p.display_name)) in ('big', 'bigverx') limit 1;
  if v_owner is null or v_m is null or v_dom is null or v_big is null then
    raise notice 'first 3v3 match not seeded: roster has no players named M, DOM and Big';
    return;
  end if;
  if exists (
    select 1 from public.squad_matches
    where rivalry_id = v_rivalry and team_name = 'BVB' and played_at = '2026-11-22T12:00:00Z'
  ) then
    return;
  end if;

  insert into public.squad_matches (rivalry_id, played_at, team_name, goals_for, goals_against, created_by)
  values (v_rivalry, '2026-11-22T12:00:00Z', 'BVB', 3, 0, v_owner)
  returning id into v_id;

  insert into public.squad_match_players (squad_match_id, slot, player_id, ingame_name, stats) values
    (v_id, 1, v_m, 'WyNM', '{"total_points":4615,"offensive_positioning":960,"shooting":370,"dueling":2177,"defensive_positioning":130,"passing":303,"dribbling":675,"goals":0,"shots":1,"shots_on_target":1,"assists":1,"key_passes":1,"passes":29,"successful_passes":16,"instrumental_passes":10,"dribbles":23,"successful_dribbles":20,"instrumental_dribbles":9,"receiving":43,"good_receives":17,"overlaps":8,"runs_out_wide":10,"forward_runs":25,"offensive_receives":1,"intercepts":17,"tackles":1,"impactful_steals":1,"frontal_presses":37,"presses_from_behind":17,"good_positioning_pct":61,"double_marks":13,"passes_obstructed":42,"players_marked":35}'::jsonb),
    (v_id, 2, v_dom, 'Do3minicT0rett0', '{"total_points":4288,"offensive_positioning":591,"shooting":661,"dueling":1921,"defensive_positioning":375,"passing":265,"dribbling":475,"goals":1,"shots":2,"shots_on_target":1,"assists":0,"key_passes":0,"passes":10,"successful_passes":8,"instrumental_passes":11,"dribbles":15,"successful_dribbles":8,"instrumental_dribbles":10,"receiving":41,"good_receives":15,"overlaps":5,"runs_out_wide":3,"forward_runs":17,"offensive_receives":1,"intercepts":14,"tackles":3,"impactful_steals":2,"frontal_presses":62,"presses_from_behind":45,"good_positioning_pct":58,"double_marks":37,"passes_obstructed":42,"players_marked":34}'::jsonb),
    (v_id, 3, v_big, 'bigverx', '{"total_points":2910,"offensive_positioning":539,"shooting":308,"dueling":1327,"defensive_positioning":306,"passing":187,"dribbling":243,"goals":2,"shots":2,"shots_on_target":2,"assists":0,"key_passes":0,"passes":14,"successful_passes":12,"instrumental_passes":8,"dribbles":15,"successful_dribbles":9,"instrumental_dribbles":5,"receiving":41,"good_receives":14,"overlaps":6,"runs_out_wide":5,"forward_runs":7,"offensive_receives":1,"intercepts":4,"tackles":3,"impactful_steals":3,"frontal_presses":47,"presses_from_behind":38,"good_positioning_pct":59,"double_marks":20,"passes_obstructed":45,"players_marked":45}'::jsonb);

  insert into public.squad_aliases (rivalry_id, name_key, ingame_name, player_id) values
    (v_rivalry, 'wynm', 'WyNM', v_m),
    (v_rivalry, 'd03m1n1ct0rett0', 'Do3minicT0rett0', v_dom),
    (v_rivalry, 'b1gverx', 'bigverx', v_big)
  on conflict (rivalry_id, name_key) do nothing;
end;
$$;
