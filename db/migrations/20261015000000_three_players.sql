-- =============================================================================
-- Three-player groups. A rivalry is now a small group (max 3 members). Every
-- match is still 1v1 between two members; assert_valid_sides and the
-- match_sides trigger already require both players to belong to the group.
-- =============================================================================

create or replace function public.rivalry_max_members()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3
$$;

revoke execute on function public.rivalry_max_members() from public, anon;
grant execute on function public.rivalry_max_members() to authenticated;

create or replace function public.enforce_rivalry_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1 from public.rivalries where id = new.rivalry_id for update;

  select count(*) into v_count
  from public.rivalry_members
  where rivalry_id = new.rivalry_id
    and user_id <> new.user_id;

  if v_count >= public.rivalry_max_members() then
    raise exception 'RIVALRY_FULL' using errcode = 'P0001',
      hint = 'A rivalry group is full.';
  end if;
  return new;
end;
$$;

create or replace function public.create_rivalry_invite(p_token_hash text, p_ttl_hours integer default 168)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_rivalry_id uuid;
  v_expires timestamptz;
begin
  select rivalry_id into v_rivalry_id from public.rivalry_members where user_id = v_uid;
  if v_rivalry_id is null then
    raise exception 'NOT_IN_RIVALRY' using errcode = 'P0001';
  end if;
  -- Serialise with joins and concurrent invite creation for this room.
  perform 1 from public.rivalries where id = v_rivalry_id for update;

  if (select count(*) from public.rivalry_members where rivalry_id = v_rivalry_id) >= public.rivalry_max_members() then
    raise exception 'RIVALRY_FULL' using errcode = 'P0001';
  end if;

  if p_ttl_hours is null or p_ttl_hours < 1 or p_ttl_hours > 720 then
    raise exception 'INVALID_TTL' using errcode = 'P0001';
  end if;

  -- Only one live invite at a time: expire any previous unused ones.
  update public.rivalry_invites
  set expires_at = least(expires_at, now())
  where rivalry_id = v_rivalry_id and used_at is null;

  v_expires := now() + make_interval(hours => p_ttl_hours);
  insert into public.rivalry_invites (rivalry_id, token_hash, created_by, expires_at)
  values (v_rivalry_id, lower(p_token_hash), v_uid, v_expires);

  return v_expires;
end;
$$;

create or replace function public.create_match(
  p_rivalry_id uuid,
  p_sides jsonb,
  p_played_at timestamptz default null,
  p_upload_id uuid default null,
  p_insert_at integer default null
)
returns table (match_id uuid, match_no integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_max integer;
  v_no integer;
  v_match_id uuid;
begin
  if not public.is_rivalry_member(p_rivalry_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if (select count(*) from public.rivalry_members where rivalry_id = p_rivalry_id) < 2 then
    raise exception 'RIVALRY_INCOMPLETE' using errcode = 'P0001';
  end if;

  perform public.assert_valid_sides(p_rivalry_id, p_sides);

  -- Serialise match numbering per rivalry.
  perform 1 from public.rivalries where id = p_rivalry_id for update;
  select coalesce(max(m.match_no), 0) into v_max from public.matches m where m.rivalry_id = p_rivalry_id;

  if p_insert_at is null or p_insert_at > v_max then
    v_no := v_max + 1;
  else
    v_no := greatest(p_insert_at, 1);
    update public.matches m set match_no = m.match_no + 1
    where m.rivalry_id = p_rivalry_id and m.match_no >= v_no;
  end if;

  insert into public.matches (rivalry_id, match_no, played_at, created_by)
  values (p_rivalry_id, v_no, p_played_at, v_uid)
  returning id into v_match_id;

  perform public.insert_match_sides(v_match_id, p_sides);

  if p_upload_id is not null then
    update public.match_uploads u
    set match_id = v_match_id
    where u.id = p_upload_id
      and u.rivalry_id = p_rivalry_id
      and u.match_id is null;
    if not found then
      raise exception 'UPLOAD_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  insert into public.match_events (match_id, actor_id, event_type, after_data)
  values (v_match_id, v_uid, 'created', public.match_snapshot(v_match_id));

  return query select v_match_id, v_no;
end;
$$;
