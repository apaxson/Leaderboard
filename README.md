# Game Room Leaderboard

A kiosk-style leaderboard for a 32" TV, built with Next.js (App Router), Tailwind CSS, and Supabase. Designed to run 24/7 on a Raspberry Pi browser.

- **`/`** — the full-screen TV board. Dark theme, no scrollbars, auto-refreshes every 20s, and force-reloads once a day (4 AM local) to bound any long-running browser memory growth.
- **`/admin`** — password-protected CRUD UI for categories, games, players, and scores.
- **`/api/leaderboard`**, **`/api/addScore`**, **`/api/addPinballScore`** — the public API surface (see below).

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/migrations/0001_init.sql`. This creates the schema (`game_categories`, `game_names`, `users`, `leaderboard`), enables Row Level Security with **no** policies (the app only ever talks to Supabase server-side with the service-role key, which bypasses RLS — the anon key is never used), and seeds the Table Games and Card Games categories/games from the spec. Pinball machines are created on the fly the first time a score is submitted for them.
3. Grab your **Project URL** and **service_role key** from Project Settings → API.

## 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=a-real-password
ADMIN_SESSION_TOKEN=$(openssl rand -hex 32)
```

`SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_SESSION_TOKEN` are secrets — never commit `.env.local` (it's already gitignored) and never expose them to the browser.

## 3. Run it

```bash
npm install
npm run dev   # http://localhost:3000
```

```bash
npm run build && npm start   # production
```

## Database schema

| Table | Purpose |
|---|---|
| `game_categories` | Top-level board blocks: Table Games, Pinball, Card Games. |
| `game_names` | An individual game/machine within a category. Carries `sort_direction` (`asc`/`desc` — which score wins) and `top_n` (how many rows the board shows). |
| `users` | Registered household/regular players. |
| `leaderboard` | One row per score. Either `user_id` **or** `custom_username` is set (never neither) — pinball walk-up guests use `custom_username` and skip the `users` table entirely. `game_category_id` is denormalized onto the row for simple filtering. |

Ranking per the spec is entirely data-driven via `game_names.sort_direction` / `top_n`, not hardcoded:

| Category | Game | Ranking | Shown |
|---|---|---|---|
| Table Games | Shuffleboard | Ascending | Top 10 |
| Table Games | Air Hockey | Ascending | Top 10 |
| Table Games | Dominoes | Descending | Top 10 |
| Table Games | Guesstures | Ascending | Top 10 |
| Table Games | Catchphrase | Ascending | Top 10 |
| Pinball | *(created dynamically per machine)* | Ascending | Top 3 |
| Card Games | Skyjo | Descending | Top 10 |
| Card Games | Five Kings | Descending | Top 10 |
| Card Games | Blitz | Ascending | Top 10 |

Adjust any of this later from `/admin` → Games (or add new categories/games entirely) — the board reflects it immediately.

## API

### `GET /api/leaderboard`
Returns every category, its games, and each game's top N entries (ranked per that game's `sort_direction`), plus an `updatedAt` timestamp. Powers both the board's initial server render and its polling refresh.

### `POST /api/addScore`
Submits a score for a **registered** player against an existing game.
```json
{ "gameNameId": "uuid", "score": 42, "displayName": "Alex" }
```
Provide either `userId` (existing player) or `displayName` (looked up case-insensitively, or created if new). Returns `201 { entry }`.

### `POST /api/addPinballScore`
Submits a score for a **walk-up guest** on a pinball machine. If the named machine hasn't been played before, it's created automatically (top 3, ascending) under the Pinball category — this is how "Various Games" grows over time.
```json
{ "gameName": "Medieval Madness", "customUsername": "Guest 1", "score": 12 }
```
`gameNameId` may be used instead of `gameName` to target an existing machine. Returns `201 { entry, game }`.

## Admin (`/admin`)

Login-gated (see `ADMIN_PASSWORD` above) via an httpOnly session cookie checked in `src/proxy.ts` (Next.js 16's `middleware.ts` successor). Once in, four tabs give full CRUD over categories, games, users, and scores — including correcting a bad score or retiring a pinball machine (set it inactive rather than deleting it, to keep history).

## Kiosk deployment notes

- Point the Pi's browser (Chromium in kiosk mode) at `/`, e.g. `chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble http://<host>:3000`.
- The board force-reloads once daily at 4 AM to bound memory growth from a browser tab that's open for weeks; adjust `DAILY_RELOAD_HOUR` in `src/components/LeaderboardBoard.tsx` if the game room is used around the clock.
- Pinball cards lay out across the category row automatically; if you accumulate many machines, use `/admin` → Games to set stale ones `is_active = false` so the board keeps fitting a 1080p screen without scrolling.
