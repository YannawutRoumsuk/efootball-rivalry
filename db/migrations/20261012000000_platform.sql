-- =============================================================================
-- Platform layer (runs first): roles, the auth schema, users and sessions.
--
-- The app connects as the database owner, but every user-scoped request runs
-- inside a transaction that does `SET LOCAL ROLE authenticated` and sets
-- `app.user_id`. Row Level Security and column grants therefore apply exactly
-- as they would for a signed-in client, and auth.uid() returns that user.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

-- Lets a non-superuser owner role switch into `authenticated` as well.
grant authenticated to current_user;
grant anon to current_user;

revoke create on schema public from public;
grant usage on schema public to authenticated, anon;

create schema if not exists auth;
revoke all on schema auth from public;
grant usage on schema auth to authenticated, anon;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and position('@' in email) > 1),
  password_hash      text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index users_email_key on auth.users (email);

-- Only a SHA-256 of the session cookie is stored, never the token itself.
create table auth.sessions (
  id         text primary key check (id ~ '^[0-9a-f]{64}$'),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on auth.sessions (user_id);
create index sessions_expires_idx on auth.sessions (expires_at);

create table auth.login_attempts (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index login_attempts_key_idx on auth.login_attempts (key, created_at desc);

-- The current request's user (set by the app per transaction), or null.
create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

revoke all on function auth.uid() from public;
grant execute on function auth.uid() to authenticated, anon;
