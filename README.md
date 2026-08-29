# Game Room Leaderboard

A kiosk-style leaderboard for a 32" TV, built with Next.js (App Router), Tailwind CSS, and Supabase. Designed to run 24/7 on a Raspberry Pi browser.

- **`/`** — the full-screen TV board. Dark theme, no scrollbars, auto-refreshes every 20s, and force-reloads once a day (4 AM local) to bound any long-running browser memory growth. A footer control switches the **time interval** (All Time / Last 7 Days / Last 3 Days); it can also be set from the URL — see [Time interval](#time-interval).
- **`/admin`** — password-protected CRUD UI for categories, games, players, and scores.
- **`/api/leaderboard`**, **`/api/addScore`**, **`/api/addPinballScore`**, **`/api/refreshPinballScore`**, **`/api/heartbeat`** — the public API surface (see below).

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
ADMIN_ALLOWED_CIDRS=10.0.0.0/22
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

## Time interval

The board can be filtered to a rolling time window based on each score's `created_at`:

| Interval | `interval` value | Meaning |
|---|---|---|
| All Time | `all` *(default)* | Every entry, no lower bound. |
| Last 7 Days | `7d` | Scores from the last 7 × 24 h. |
| Last 3 Days | `3d` | Scores from the last 3 × 24 h. |

Only the entries inside the window are ranked, so a game's top N reflects just that period.

**Setting it:**

- **Footer control** on `/` — clicking a range refetches immediately and rewrites the URL (`?interval=7d`, or the param is dropped for `all`) so the choice survives the daily reload and can be bookmarked or shared.
- **URL parameter** — load `/?interval=7d` (or `3d`, or `all`) to start on that interval. This is the value the kiosk should be pointed at if you want it to boot into a specific window. An unknown or missing value falls back to `all`.
- **API** — `GET /api/leaderboard?interval=7d` returns the same filtered payload (see below).

## API

### `GET /api/leaderboard`
Returns every category, its games, and each game's top N entries (ranked per that game's `sort_direction`), plus an `updatedAt` timestamp and the `interval` the payload was filtered to. Powers both the board's initial server render and its polling refresh.

Optional query param `?interval=` — `all` (default), `7d`, or `3d` — filters entries by `created_at` to that rolling window before ranking (see [Time interval](#time-interval)). Unknown values fall back to `all`.

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

### `POST /api/refreshPinballScore`
Wipes **every** existing score for one pinball machine and replaces it with the full list provided — for resyncing a machine's whole scoreboard at once (e.g. from an external tracker), rather than adding one new score at a time.
```json
{
  "gameName": "Medieval Madness",
  "scores": [
    { "customUsername": "Alex", "score": 12 },
    { "customUsername": "Jordan", "score": 9 }
  ]
}
```
`gameNameId` may be used instead of `gameName`; the machine is auto-created if it doesn't exist yet, same as `/api/addPinballScore`. `scores` may be an empty array to just clear the machine. Returns `200 { game, deletedCount, entries }`.

### `POST /api/heartbeat`
Records the latest "the score feed is alive" timestamp. Send an empty body to stamp the server's `now()`, or pass a specific moment:
```json
{ "timestamp": "2026-08-28T14:00:00Z", "source": "pinball-sync" }
```
Both fields are optional. Returns `200 { beatAt, source, ageMs, stale, staleAfterMs }`.

### `GET /api/heartbeat`
Returns the same `{ beatAt, source, ageMs, stale, staleAfterMs }` shape for the latest heartbeat. The board polls this every 15s and shows a red **Pinball Sync Error** in the footer once the latest beat is more than 90 seconds old (`staleAfterMs`).

## Admin (`/admin`)

Two layers, both enforced in `src/proxy.ts` (Next.js 16's `middleware.ts` successor), before any request reaches a page or API route:

1. **Network allowlist.** The entire `/admin` surface — including the login page itself — is restricted to the CIDR ranges in `ADMIN_ALLOWED_CIDRS` (default `10.0.0.0/22`, i.e. `10.0.0.0`–`10.0.3.255`). Anything outside that range gets a `403` before it can even see the login form. Multiple ranges can be comma-separated (e.g. to also allow a VPN subnet).
2. **Password.** Once past the network check, an httpOnly session cookie (set on successful `POST /api/admin/login`, checked against `ADMIN_SESSION_TOKEN`) gates everything else.

Once in, four tabs give full CRUD over categories, games, users, and scores — including correcting a bad score or retiring a pinball machine (set it inactive rather than deleting it, to keep history).

> **Caveat:** the network check reads the `X-Forwarded-For` header, which Next.js populates from the raw TCP connection when a request doesn't already carry that header. That's reliable as long as the Pi is directly exposed to your LAN with nothing in front of it (the standard kiosk setup — see below). If you ever put this behind a reverse proxy (or expose it beyond a trusted LAN), make sure that proxy strips any inbound `X-Forwarded-For` before setting its own, otherwise a client could forge the header to spoof its IP. Local dev note: browsing `localhost:3000/admin` shows up as `127.0.0.1`, which isn't in `10.0.0.0/22` — add `127.0.0.1/32` to `ADMIN_ALLOWED_CIDRS` in your own `.env.local` if you need admin access while developing locally.

## Kiosk deployment notes

- Point the Pi's browser (Chromium in kiosk mode) at `/`, e.g. `chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble http://<host>:3000`. Append `?interval=7d` (or `3d`) to the URL to boot into a specific [time interval](#time-interval) instead of All Time.
- The board force-reloads once daily at 4 AM to bound memory growth from a browser tab that's open for weeks; adjust `DAILY_RELOAD_HOUR` in `src/components/LeaderboardBoard.tsx` if the game room is used around the clock.
- Pinball cards lay out across the category row automatically; if you accumulate many machines, use `/admin` → Games to set stale ones `is_active = false` so the board keeps fitting a 1080p screen without scrolling.
