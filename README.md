# eFootball Rivalry Tracker

A private, mobile-first head-to-head tracker for exactly two friends. Upload an eFootball **Full Time** screenshot → a vision model extracts the score and stats → you confirm who played on the left → review/correct → save. Both players see the same dashboard update in real time.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · PostgreSQL (postgres.js) · Recharts · Zod · Gemini via OpenRouter (OpenAI/Anthropic also supported) · PWA. Everything runs on **Railway**: the web service, a Railway Postgres database, and a Railway Volume for screenshots.

---

## How it works

| Concept | Where it lives | Why |
|---|---|---|
| **Player identity** | `profiles.id` | The only thing stats are keyed on. |
| **Screen side** (left/right) | `match_sides.screen_side` | Assigned per match by the uploader ("Who was on the left?"). |
| **On-screen label** | `match_sides.onscreen_label` | Raw text from the screenshot — never assumed to be a team or a player. |
| **Team used** | `match_sides.team_name` | Optional, per match. |
| **Chronological order** | `matches.match_no` | Editable (reorder / insert historical matches). Upload time is never used as match time. |

* **Login is a shared numeric room code** (`APP_PIN`): enter it, then tap which player you are. The two player seats are created automatically on first login (existing data is reused). Changing `APP_PIN` signs every device out. The underlying schema still caps a rivalry at two members via a Postgres trigger with row locks.
* Official stats use **confirmed** matches only. **Disputed** matches are excluded until resolved; **void** matches stay in history but never count. Nothing is hard-deleted; every create/edit/dispute/void/reorder is written to `match_events` with before/after snapshots.
* **Security model.** The app connects as the database owner, but every user request runs in a transaction that does `SET LOCAL ROLE authenticated` and sets `app.user_id`. Row Level Security, column grants and `auth.uid()` therefore apply to all user data access. Multi-row writes are `SECURITY DEFINER` RPCs that re-check membership. PIN attempts are rate-limited per IP and globally; sessions are random tokens stored only as SHA-256 hashes (bound to the current PIN) in an httpOnly, SameSite=Lax cookie; state-changing API calls must be same-origin.
* **Realtime.** A trigger on `matches` emits `NOTIFY rivalry_events`; the server keeps one `LISTEN` connection and pushes events to that rivalry's members over Server-Sent Events (`/api/events`). Pages re-render in place.
* **Screenshots** are stored on the volume and served only through `/api/screenshots/<id>`, which checks membership via RLS.
* Averages exclude missing values (null ≠ 0). Ratios (shot accuracy, pass completion) are computed from totals over matches that report both numbers.

## Project structure

```
db/migrations/
  20261012000000_platform.sql   roles, auth schema (users, sessions, login attempts), auth.uid()
  20261013000000_init.sql       rivalry schema, constraints, RLS, RPCs, NOTIFY trigger
scripts/
  migrate.mjs                   applies migrations once each (Railway pre-deploy step)
  local-db.mjs                  real local PostgreSQL via embedded-postgres (no Docker)
src/
  proxy.ts                      redirects visitors without a session cookie to /login
  app/
    (app)/                      dashboard, matches, matches/[id], stats, upload, upload/batch, settings
    api/                        auth/{pin,logout}, uploads, uploads/[id]/extract,
                                screenshots/[id], events (SSE), matches (+check, [id], status, move),
                                rivalry (rename), profile, health
    login, setup, offline, manifest.ts
  lib/
    db.ts                       postgres.js pool + withUser() (RLS-scoped transactions)
    auth/                       PIN check, seat provisioning, sessions
    domain/                     pure, tested logic: stats, streaks, timeline, records, insights, validation, extraction, duplicates, invites
    ai/extract.ts               OpenRouter / OpenAI / Anthropic vision call + JSON schema
    server/                     request context, image inspection (sharp), storage, realtime hub, rate limits, duplicates
tests/
  unit/                         stats, winner attribution, streaks, form, aggregation, extraction, validation, duplicates, redirects
  db/                           runs the real migrations in PGlite: RLS, member cap, rollback, ordering, audit trail
  integration/                  real PostgreSQL: concurrent joins, concurrent saves, RLS, rollback, realtime NOTIFY, Thai text
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | On Railway: `${{Postgres.DATABASE_URL}}` (private network). |
| `STORAGE_DIR` | ✅ (prod) | Directory on the Railway Volume, e.g. `/data/screenshots`. |
| `APP_PIN` | ✅ | Numeric room code (4–12 digits) both players enter. Change it to sign everyone out. |
| `PLAYER_A_NAME`, `PLAYER_B_NAME` | optional | Starting seat names (renameable in the app). |
| `OPENROUTER_API_KEY` | optional | Enables AI extraction via OpenRouter. Without an AI key the app still works with manual entry. |
| `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL` | optional | Defaults `google/gemini-3.5-flash-lite` / `google/gemini-3.8-flash`. |
| `AI_PROVIDER`, `OPENAI_*`, `ANTHROPIC_*` | optional | Use OpenAI or Claude instead. |

## Local development

```bash
npm install
npm run db:local            # terminal 1: real PostgreSQL on 127.0.0.1:54330
cp .env.example .env.local  # DATABASE_URL already points at the local DB
npm run db:migrate          # with DATABASE_URL set
npm run dev                 # http://localhost:3000
```

## Testing

```bash
npm test                    # unit + PGlite database tests (no services needed)
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54330/rivalry_test npm run test:integration
npm run typecheck && npm run lint && npm run build
```

Required scenarios: (1–2) winner with Player A left/right · (3) draws · (4) goal difference · (5) streaks · (6) recent form · (7) aggregation with missing values · (8) duplicate image detection (SHA-256 + dHash) · (9) missing AI values · (10) invalid statistics · (11) unauthorized access · (12) third member blocked, including a real concurrent race · (13) transaction rollback · (14) historical ordering · (15) realtime across two sessions (NOTIFY → hub → subscriber).

## Deploying to Railway

The Railway project `efootball-rivalry` contains:

* **efootball-rivalry** — the web service (Railpack build, `npm run start`), with a Volume mounted at `/data`.
* **Postgres** — Railway Postgres, reachable only over the private network.

`npm start` runs `node scripts/migrate.mjs` before `next start`, so schema changes apply automatically on every deploy (idempotent, advisory-locked). `/api/health` reports database, volume, AI provider and login state.

```bash
railway up --detach -y --service efootball-rivalry
railway variables --service efootball-rivalry --set "APP_PIN=123456"
railway variables --service efootball-rivalry --set "OPENROUTER_API_KEY=sk-or-..."
```

Setting variables triggers a redeploy. Backups: enable them on the Postgres service (Railway → Postgres → Backups); screenshots live on the app volume.

## Install on iPhone

Open the site in Safari → Share → **Add to Home Screen**. The app runs standalone with its own icon; the bottom bar puts **Upload** one tap away.
