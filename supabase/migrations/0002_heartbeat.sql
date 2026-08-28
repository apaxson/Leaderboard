-- Heartbeat: a single-row table holding the most recent timestamp POSTed to
-- /api/heartbeat. The kiosk board polls it and shows a red "Pinball Sync
-- Error" in the footer when the latest beat is more than 90 seconds old, so
-- a wedged score-feeder / cron job is visible on the TV rather than silently
-- stale.

create table if not exists public.heartbeat (
  id          boolean primary key default true,
  beat_at     timestamptz not null default now(),
  source      text,
  updated_at  timestamptz not null default now(),
  constraint heartbeat_singleton check (id)
);

-- Seed the one row so callers can always UPDATE (or upsert) without a
-- first-time special case.
insert into public.heartbeat (id) values (true) on conflict (id) do nothing;

-- Reads/writes go through the service-role key in Route Handlers, same as
-- every other table; RLS on with no policies locks out the anon key.
alter table public.heartbeat enable row level security;
