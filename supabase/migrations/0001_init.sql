-- Leaderboard schema
-- Run this in the Supabase SQL editor, or via `supabase db push`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- game_categories: the top-level groupings shown as blocks on the TV board.
-- e.g. "Table Games", "Pinball", "Card Games"
-- ---------------------------------------------------------------------------
create table if not exists public.game_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- game_names: an individual game/machine within a category.
-- sort_direction controls whether a lower or higher score ranks first.
-- top_n controls how many entries the board displays for this game.
-- ---------------------------------------------------------------------------
create table if not exists public.game_names (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.game_categories(id) on delete cascade,
  name            text not null,
  slug            text not null,
  sort_direction  text not null default 'asc' check (sort_direction in ('asc', 'desc')),
  top_n           integer not null default 10 check (top_n > 0),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (category_id, name),
  unique (category_id, slug)
);

create index if not exists game_names_category_id_idx on public.game_names (category_id);

-- ---------------------------------------------------------------------------
-- users: registered household/regular players. Guests (e.g. pinball drop-ins)
-- do not need a row here -- they are captured via leaderboard.custom_username.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null unique,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- leaderboard: one row per submitted score.
-- Either user_id or custom_username must be present (never neither).
-- game_category_id is denormalized onto the row for fast/simple filtering
-- and must always match game_names.category_id for game_name_id.
-- ---------------------------------------------------------------------------
create table if not exists public.leaderboard (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id) on delete set null,
  custom_username   text,
  score             numeric not null,
  game_category_id  uuid not null references public.game_categories(id) on delete cascade,
  game_name_id      uuid not null references public.game_names(id) on delete cascade,
  created_at        timestamptz not null default now(),
  constraint leaderboard_player_present check (
    user_id is not null or (custom_username is not null and length(trim(custom_username)) > 0)
  )
);

create index if not exists leaderboard_game_name_id_idx on public.leaderboard (game_name_id);
create index if not exists leaderboard_game_category_id_idx on public.leaderboard (game_category_id);
create index if not exists leaderboard_created_at_idx on public.leaderboard (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: all reads/writes happen through Next.js Route Handlers
-- using the Supabase service-role key (server-only), which bypasses RLS.
-- Enabling RLS with no policies means the anon/public key -- if ever leaked
-- or used client-side -- cannot read or write anything.
-- ---------------------------------------------------------------------------
alter table public.game_categories enable row level security;
alter table public.game_names      enable row level security;
alter table public.users           enable row level security;
alter table public.leaderboard     enable row level security;

-- ---------------------------------------------------------------------------
-- Seed data: categories + fixed games. Pinball machines are created
-- dynamically by /api/addPinballScore as they're first played.
-- ---------------------------------------------------------------------------
insert into public.game_categories (name, slug, sort_order) values
  ('Table Games', 'table', 1),
  ('Pinball', 'pinball', 2),
  ('Card Games', 'cards', 3)
on conflict (slug) do nothing;

insert into public.game_names (category_id, name, slug, sort_direction, top_n, sort_order)
select c.id, g.name, g.slug, g.sort_direction, g.top_n, g.sort_order
from public.game_categories c
join (
  values
    ('table', 'Shuffleboard', 'shuffleboard', 'asc', 10, 1),
    ('table', 'Air Hockey',   'air-hockey',   'asc', 10, 2),
    ('table', 'Dominoes',     'dominoes',     'desc', 10, 3),
    ('table', 'Guesstures',   'guesstures',   'asc', 10, 4),
    ('table', 'Catchphrase',  'catchphrase',  'asc', 10, 5),
    ('cards', 'Skyjo',        'skyjo',        'desc', 10, 1),
    ('cards', 'Five Kings',   'five-kings',   'desc', 10, 2),
    ('cards', 'Blitz',        'blitz',        'asc', 10, 3)
) as g(category_slug, name, slug, sort_direction, top_n, sort_order)
  on g.category_slug = c.slug
on conflict (category_id, name) do nothing;
