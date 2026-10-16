-- =============================================================================
-- Seasons. A season is a calendar quarter (Bangkok time). `season_epoch` is
-- when a group switched seasons on: everything recorded before it becomes the
-- pre-season. No match data changes; seasons are computed from match dates.
-- Rollback: the previous app version ignores this column.
-- =============================================================================

alter table public.rivalries add column if not exists season_epoch timestamptz;

-- Existing groups: what has been played so far becomes the pre-season.
-- New groups keep null (no pre-season).
update public.rivalries set season_epoch = now() where season_epoch is null;
