-- PIN login: each session remembers a fingerprint of the APP_PIN it was created
-- with, so changing APP_PIN in the environment signs every device out.
alter table auth.sessions add column if not exists pin_hash text;

-- Placeholder accounts for the two fixed player seats have no usable password.
comment on column auth.users.password_hash is
  'scrypt hash, or ''!pin-login'' for seats that sign in with the shared APP_PIN';
