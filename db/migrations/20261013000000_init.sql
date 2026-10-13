-- =============================================================================
-- eFootball Rivalry Tracker — initial schema
--
-- Design notes
--  * A player's identity is always profiles.id. Screen side (left/right),
--    on-screen label and team name are per-match attributes in match_sides.
--  * All writes that touch more than one row go through SECURITY DEFINER RPCs
--    so they run in a single transaction and re-check membership themselves.
--  * Clients only get SELECT on most tables; RLS limits rows to rivalry members.
--  * Nothing is ever hard-deleted from match history: matches are voided.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url   text check (avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url ~ '^https://')),
  created_at   timestamptz not null default now()
);

create table public.rivalries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.rivalry_members (
  rivalry_id uuid not null references public.rivalries (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (rivalry_id, user_id),
  -- A user belongs to exactly one rivalry room.
  constraint rivalry_members_one_room_per_user unique (user_id)
);

create table public.rivalry_invites (
  id         uuid primary key default gen_random_uuid(),
  rivalry_id uuid not null references public.rivalries (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index rivalry_invites_rivalry_idx on public.rivalry_invites (rivalry_id);

create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  rivalry_id  uuid not null references public.rivalries (id) on delete cascade,
  -- Rivalry-scoped sequence. This (not upload time) defines chronological order.
  match_no    integer not null check (match_no > 0),
  played_at   timestamptz,
  created_by  uuid not null references public.profiles (id),
  status      text not null default 'confirmed' check (status in ('confirmed', 'disputed', 'void')),
  status_note text check (status_note is null or char_length(status_note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Deferrable so reordering can shift numbers inside one transaction.
  constraint matches_rivalry_match_no_key unique (rivalry_id, match_no) deferrable initially deferred
);
create index matches_rivalry_status_no_idx on public.matches (rivalry_id, status, match_no);

create table public.match_sides (
  match_id          uuid not null references public.matches (id) on delete cascade,
  player_id         uuid not null references public.profiles (id),
  screen_side       text not null check (screen_side in ('left', 'right')),
  onscreen_label    text check (onscreen_label is null or char_length(onscreen_label) <= 60),
  team_name         text check (team_name is null or char_length(team_name) <= 60),
  goals             integer not null check (goals between 0 and 99),
  possession_pct    numeric(5, 2) check (possession_pct between 0 and 100),
  shots             integer check (shots between 0 and 200),
  shots_on_target   integer check (shots_on_target between 0 and 200),
  fouls             integer check (fouls between 0 and 200),
  offsides          integer check (offsides between 0 and 200),
  corners           integer check (corners between 0 and 200),
  free_kicks        integer check (free_kicks between 0 and 200),
  passes            integer check (passes between 0 and 3000),
  successful_passes integer check (successful_passes between 0 and 3000),
  crosses           integer check (crosses between 0 and 500),
  interceptions     integer check (interceptions between 0 and 500),
  tackles           integer check (tackles between 0 and 500),
  saves             integer check (saves between 0 and 200),
  primary key (match_id, screen_side),
  constraint match_sides_distinct_players unique (match_id, player_id),
  constraint match_sides_sot_le_shots
    check (shots_on_target is null or shots is null or shots_on_target <= shots),
  constraint match_sides_successful_le_passes
    check (successful_passes is null or passes is null or successful_passes <= passes)
);
create index match_sides_player_idx on public.match_sides (player_id);

create table public.match_uploads (
  id                uuid primary key default gen_random_uuid(),
  rivalry_id        uuid not null references public.rivalries (id) on delete cascade,
  match_id          uuid references public.matches (id) on delete set null,
  uploaded_by       uuid not null references public.profiles (id),
  storage_path      text not null unique,
  image_hash        text not null check (image_hash ~ '^[0-9a-f]{64}$'),
  perceptual_hash   text check (perceptual_hash is null or perceptual_hash ~ '^[0-9a-f]{16}$'),
  mime_type         text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes        integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  extraction_json   jsonb,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'processing', 'succeeded', 'failed', 'manual')),
  extraction_error  text,
  created_at        timestamptz not null default now(),
  -- Objects must live in the rivalry's own storage folder.
  constraint match_uploads_path_in_rivalry check (storage_path like rivalry_id::text || '/%')
);
create index match_uploads_rivalry_hash_idx on public.match_uploads (rivalry_id, image_hash);
create index match_uploads_match_idx on public.match_uploads (match_id);

create table public.match_events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  event_type  text not null
    check (event_type in ('created', 'updated', 'disputed', 'resolved', 'voided', 'restored', 'reordered')),
  before_data jsonb,
  after_data  jsonb,
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now()
);
create index match_events_match_idx on public.match_events (match_id, created_at);

create table public.api_rate_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);
create index api_rate_events_lookup_idx on public.api_rate_events (user_id, action, created_at desc);

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

-- SECURITY DEFINER so RLS policies can call it without recursing into
-- rivalry_members' own policy.
create or replace function public.is_rivalry_member(p_rivalry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rivalry_members
    where rivalry_id = p_rivalry_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.shares_rivalry_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rivalry_members me
    join public.rivalry_members other on other.rivalry_id = me.rivalry_id
    where me.user_id = (select auth.uid())
      and other.user_id = p_user_id
  );
$$;

create or replace function public.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- Full, stable JSON snapshot of a match used for the audit trail.
create or replace function public.match_snapshot(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'match_no', m.match_no,
    'played_at', m.played_at,
    'status', m.status,
    'status_note', m.status_note,
    'sides', coalesce((
      select jsonb_agg(to_jsonb(s) - 'match_id' order by s.screen_side)
      from public.match_sides s
      where s.match_id = m.id
    ), '[]'::jsonb)
  )
  from public.matches m
  where m.id = p_match_id;
$$;

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Player'
      ),
      40
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enforces the two-member maximum. Locking the rivalry row serialises
-- concurrent joins so two invite redemptions cannot both see "1 member".
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

  if v_count >= 2 then
    raise exception 'RIVALRY_FULL' using errcode = 'P0001',
      hint = 'A rivalry room can only have two members.';
  end if;
  return new;
end;
$$;

create trigger rivalry_members_limit
  before insert or update of rivalry_id on public.rivalry_members
  for each row execute function public.enforce_rivalry_member_limit();

-- Both players on a match must belong to the match's rivalry.
create or replace function public.enforce_match_side_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.matches m
    join public.rivalry_members rm on rm.rivalry_id = m.rivalry_id
    where m.id = new.match_id
      and rm.user_id = new.player_id
  ) then
    raise exception 'PLAYER_NOT_IN_RIVALRY' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger match_sides_player_in_rivalry
  before insert or update on public.match_sides
  for each row execute function public.enforce_match_side_player();

-- Every match must have exactly two sides (left + right) at commit time.
create or replace function public.enforce_match_two_sides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid;
  v_count integer;
begin
  if tg_table_name = 'matches' then
    v_match_id := new.id;
  elsif tg_op = 'DELETE' then
    v_match_id := old.match_id;
  else
    v_match_id := new.match_id;
  end if;

  -- The match itself was removed (rivalry deleted): nothing to check.
  if not exists (select 1 from public.matches where id = v_match_id) then
    return null;
  end if;

  select count(*) into v_count from public.match_sides where match_id = v_match_id;
  if v_count <> 2 then
    raise exception 'MATCH_REQUIRES_TWO_SIDES' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger matches_require_two_sides
  after insert on public.matches
  deferrable initially deferred
  for each row execute function public.enforce_match_two_sides();

create constraint trigger match_sides_require_two_sides
  after insert or update or delete on public.match_sides
  deferrable initially deferred
  for each row execute function public.enforce_match_two_sides();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger matches_touch_updated_at
  before update on public.matches
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.rivalries       enable row level security;
alter table public.rivalry_members enable row level security;
alter table public.rivalry_invites enable row level security;
alter table public.matches         enable row level security;
alter table public.match_sides     enable row level security;
alter table public.match_uploads   enable row level security;
alter table public.match_events    enable row level security;
alter table public.api_rate_events enable row level security;

create policy "profiles: read self and rival"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_rivalry_with(id));

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "rivalries: members read"
  on public.rivalries for select to authenticated
  using (public.is_rivalry_member(id));

create policy "rivalries: members rename"
  on public.rivalries for update to authenticated
  using (public.is_rivalry_member(id))
  with check (public.is_rivalry_member(id));

create policy "rivalry_members: members read"
  on public.rivalry_members for select to authenticated
  using (public.is_rivalry_member(rivalry_id));

create policy "rivalry_invites: members read"
  on public.rivalry_invites for select to authenticated
  using (public.is_rivalry_member(rivalry_id));

create policy "matches: members read"
  on public.matches for select to authenticated
  using (public.is_rivalry_member(rivalry_id));

create policy "match_sides: members read"
  on public.match_sides for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_sides.match_id
      and public.is_rivalry_member(m.rivalry_id)
  ));

create policy "match_uploads: members read"
  on public.match_uploads for select to authenticated
  using (public.is_rivalry_member(rivalry_id));

create policy "match_uploads: members insert own"
  on public.match_uploads for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and match_id is null
    and public.is_rivalry_member(rivalry_id)
  );

-- Only extraction columns are updatable (see column grants below), and only
-- while the upload is not yet attached to a saved match.
create policy "match_uploads: members update extraction"
  on public.match_uploads for update to authenticated
  using (public.is_rivalry_member(rivalry_id) and match_id is null)
  with check (public.is_rivalry_member(rivalry_id) and match_id is null);

create policy "match_events: members read"
  on public.match_events for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_events.match_id
      and public.is_rivalry_member(m.rivalry_id)
  ));

-- api_rate_events: no policies; accessed only through consume_rate_limit().

-- -----------------------------------------------------------------------------
-- Privileges: read-only by default, writes via RPCs.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  public.profiles, public.rivalries, public.rivalry_members, public.rivalry_invites,
  public.matches, public.match_sides, public.match_uploads, public.match_events
  to authenticated;

grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (name) on public.rivalries to authenticated;
grant insert (rivalry_id, uploaded_by, storage_path, image_hash, perceptual_hash,
              mime_type, size_bytes, extraction_status)
  on public.match_uploads to authenticated;
grant update (extraction_json, extraction_status, extraction_error)
  on public.match_uploads to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

create or replace function public.create_rivalry(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_rivalry_id uuid;
begin
  if exists (select 1 from public.rivalry_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_RIVALRY' using errcode = 'P0001';
  end if;

  insert into public.rivalries (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_rivalry_id;

  insert into public.rivalry_members (rivalry_id, user_id, role)
  values (v_rivalry_id, v_uid, 'owner');

  return v_rivalry_id;
end;
$$;

-- The raw invite code never reaches the database; only its SHA-256 hash.
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

  if (select count(*) from public.rivalry_members where rivalry_id = v_rivalry_id) >= 2 then
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

create or replace function public.accept_rivalry_invite(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_invite public.rivalry_invites%rowtype;
begin
  -- Row lock: two people redeeming the same code are serialised here.
  select * into v_invite
  from public.rivalry_invites
  where token_hash = lower(p_token_hash)
  for update;

  if not found then
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rivalry_members where user_id = v_uid and rivalry_id = v_invite.rivalry_id) then
    return v_invite.rivalry_id;
  end if;
  if v_invite.used_at is not null then
    raise exception 'INVITE_USED' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'INVITE_EXPIRED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rivalry_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_RIVALRY' using errcode = 'P0001';
  end if;

  -- The member-limit trigger locks the rivalry row and rejects a third member.
  insert into public.rivalry_members (rivalry_id, user_id, role)
  values (v_invite.rivalry_id, v_uid, 'member');

  update public.rivalry_invites
  set used_at = now(), used_by = v_uid
  where id = v_invite.id;

  return v_invite.rivalry_id;
end;
$$;

-- Leaving is only allowed before any match exists, so history can never lose a player.
create or replace function public.leave_rivalry()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_rivalry_id uuid;
begin
  select rivalry_id into v_rivalry_id from public.rivalry_members where user_id = v_uid;
  if v_rivalry_id is null then
    raise exception 'NOT_IN_RIVALRY' using errcode = 'P0001';
  end if;
  perform 1 from public.rivalries where id = v_rivalry_id for update;

  if exists (select 1 from public.matches where rivalry_id = v_rivalry_id) then
    raise exception 'RIVALRY_HAS_MATCHES' using errcode = 'P0001';
  end if;

  delete from public.rivalry_members where rivalry_id = v_rivalry_id and user_id = v_uid;

  if not exists (select 1 from public.rivalry_members where rivalry_id = v_rivalry_id) then
    delete from public.rivalries where id = v_rivalry_id;
  else
    update public.rivalry_members set role = 'owner' where rivalry_id = v_rivalry_id;
  end if;
end;
$$;

-- Validates the p_sides payload: exactly one left and one right, two distinct
-- rivalry members. Column constraints validate the numbers themselves.
create or replace function public.assert_valid_sides(p_rivalry_id uuid, p_sides jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_sides) <> 'array' or jsonb_array_length(p_sides) <> 2 then
    raise exception 'INVALID_SIDES' using errcode = 'P0001', detail = 'Exactly two sides are required.';
  end if;
  if (select count(distinct s ->> 'screen_side') from jsonb_array_elements(p_sides) s
      where s ->> 'screen_side' in ('left', 'right')) <> 2 then
    raise exception 'INVALID_SIDES' using errcode = 'P0001', detail = 'One left and one right side are required.';
  end if;
  if (select count(distinct public.try_uuid(s ->> 'player_id')) from jsonb_array_elements(p_sides) s) <> 2 then
    raise exception 'INVALID_SIDES' using errcode = 'P0001', detail = 'Two distinct players are required.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sides) s
    where not exists (
      select 1 from public.rivalry_members rm
      where rm.rivalry_id = p_rivalry_id
        and rm.user_id = public.try_uuid(s ->> 'player_id')
    )
  ) then
    raise exception 'PLAYER_NOT_IN_RIVALRY' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.insert_match_sides(p_match_id uuid, p_sides jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.match_sides (
    match_id, player_id, screen_side, onscreen_label, team_name, goals, possession_pct,
    shots, shots_on_target, fouls, offsides, corners, free_kicks, passes,
    successful_passes, crosses, interceptions, tackles, saves
  )
  select
    p_match_id, s.player_id, s.screen_side, nullif(btrim(s.onscreen_label), ''),
    nullif(btrim(s.team_name), ''), s.goals, s.possession_pct, s.shots, s.shots_on_target,
    s.fouls, s.offsides, s.corners, s.free_kicks, s.passes, s.successful_passes, s.crosses,
    s.interceptions, s.tackles, s.saves
  from jsonb_to_recordset(p_sides) as s (
    player_id uuid, screen_side text, onscreen_label text, team_name text, goals integer,
    possession_pct numeric, shots integer, shots_on_target integer, fouls integer,
    offsides integer, corners integer, free_kicks integer, passes integer,
    successful_passes integer, crosses integer, interceptions integer, tackles integer,
    saves integer
  );
$$;

-- Creates a match, both sides, links the screenshot and writes the audit
-- event in one transaction. Any failure rolls everything back.
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
  if (select count(*) from public.rivalry_members where rivalry_id = p_rivalry_id) <> 2 then
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

create or replace function public.update_match(
  p_match_id uuid,
  p_sides jsonb,
  p_played_at timestamptz default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_match public.matches%rowtype;
  v_before jsonb;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or not public.is_rivalry_member(v_match.rivalry_id) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_match.status = 'void' then
    raise exception 'MATCH_VOID' using errcode = 'P0001';
  end if;

  perform public.assert_valid_sides(v_match.rivalry_id, p_sides);
  v_before := public.match_snapshot(p_match_id);

  update public.matches set played_at = p_played_at where id = p_match_id;
  delete from public.match_sides where match_id = p_match_id;
  perform public.insert_match_sides(p_match_id, p_sides);

  insert into public.match_events (match_id, actor_id, event_type, before_data, after_data, note)
  values (p_match_id, v_uid, 'updated', v_before, public.match_snapshot(p_match_id),
          nullif(btrim(p_note), ''));
end;
$$;

create or replace function public.set_match_status(p_match_id uuid, p_action text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_match public.matches%rowtype;
  v_note text := nullif(btrim(p_note), '');
  v_next text;
  v_event text;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or not public.is_rivalry_member(v_match.rivalry_id) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  case p_action
    when 'dispute' then
      if v_match.status <> 'confirmed' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
      if v_note is null then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
      v_next := 'disputed'; v_event := 'disputed';
    when 'resolve' then
      if v_match.status <> 'disputed' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
      v_next := 'confirmed'; v_event := 'resolved';
    when 'void' then
      if v_match.status = 'void' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
      if v_note is null then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
      v_next := 'void'; v_event := 'voided';
    when 'restore' then
      if v_match.status <> 'void' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
      v_next := 'confirmed'; v_event := 'restored';
    else
      raise exception 'INVALID_ACTION' using errcode = 'P0001';
  end case;

  update public.matches
  set status = v_next,
      status_note = case when v_next = 'confirmed' then null else v_note end
  where id = p_match_id;

  insert into public.match_events (match_id, actor_id, event_type, before_data, after_data, note)
  values (p_match_id, v_uid, v_event,
          jsonb_build_object('status', v_match.status, 'status_note', v_match.status_note),
          jsonb_build_object('status', v_next), v_note);

  return v_next;
end;
$$;

-- Moves a match to a new position in the rivalry sequence (historical imports).
create or replace function public.move_match(p_match_id uuid, p_new_no integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_match public.matches%rowtype;
  v_max integer;
  v_target integer;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found or not public.is_rivalry_member(v_match.rivalry_id) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform 1 from public.rivalries where id = v_match.rivalry_id for update;
  select * into v_match from public.matches where id = p_match_id for update;
  select max(m.match_no) into v_max from public.matches m where m.rivalry_id = v_match.rivalry_id;
  v_target := least(greatest(coalesce(p_new_no, v_match.match_no), 1), v_max);

  if v_target = v_match.match_no then
    return v_target;
  end if;

  if v_target < v_match.match_no then
    update public.matches m set match_no = m.match_no + 1
    where m.rivalry_id = v_match.rivalry_id
      and m.match_no >= v_target and m.match_no < v_match.match_no;
  else
    update public.matches m set match_no = m.match_no - 1
    where m.rivalry_id = v_match.rivalry_id
      and m.match_no > v_match.match_no and m.match_no <= v_target;
  end if;

  update public.matches set match_no = v_target where id = p_match_id;

  insert into public.match_events (match_id, actor_id, event_type, before_data, after_data)
  values (p_match_id, v_uid, 'reordered',
          jsonb_build_object('match_no', v_match.match_no),
          jsonb_build_object('match_no', v_target));

  return v_target;
end;
$$;

-- Sliding-window rate limiter. Returns false when the caller is over the limit.
create or replace function public.consume_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_action, 0));

  select count(*) into v_count
  from public.api_rate_events
  where user_id = v_uid
    and action = p_action
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return false;
  end if;

  insert into public.api_rate_events (user_id, action) values (v_uid, p_action);
  delete from public.api_rate_events
  where user_id = v_uid and created_at < now() - interval '2 days';
  return true;
end;
$$;

revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.is_rivalry_member(uuid),
  public.shares_rivalry_with(uuid),
  public.try_uuid(text),
  public.create_rivalry(text),
  public.create_rivalry_invite(text, integer),
  public.accept_rivalry_invite(text),
  public.leave_rivalry(),
  public.create_match(uuid, jsonb, timestamptz, uuid, integer),
  public.update_match(uuid, jsonb, timestamptz, text),
  public.set_match_status(uuid, text, text),
  public.move_match(uuid, integer),
  public.consume_rate_limit(text, integer, integer)
  to authenticated;

-- Internal helpers stay private.
revoke execute on function
  public.match_snapshot(uuid),
  public.assert_valid_sides(uuid, jsonb),
  public.insert_match_sides(uuid, jsonb),
  public.require_user()
  from authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: every change to a match emits a NOTIFY on `rivalry_events`. The
-- app server LISTENs once and fans events out to that rivalry's members over
-- Server-Sent Events (membership is checked when each stream opens).
-- -----------------------------------------------------------------------------

create or replace function public.notify_match_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.matches%rowtype;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  perform pg_notify(
    'rivalry_events',
    json_build_object('rivalry_id', v_row.rivalry_id, 'match_id', v_row.id, 'op', tg_op)::text
  );
  return null;
end;
$$;

revoke execute on function public.notify_match_change() from public, anon, authenticated;

create trigger matches_notify_change
  after insert or update or delete on public.matches
  for each row execute function public.notify_match_change();
