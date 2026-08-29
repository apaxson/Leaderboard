export type SortDirection = "asc" | "desc";

// -- Time window filter (Leaderboard display) ------------------------------

/** Time range the board is filtered to, by leaderboard `created_at`. */
export type TimeWindow = "all" | "7d" | "3d";

export const TIME_WINDOWS: readonly TimeWindow[] = ["all", "7d", "3d"] as const;

export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  all: "All Time",
  "7d": "Last 7 Days",
  "3d": "Last 3 Days",
};

/** Days each bounded window spans; `all` has no cutoff. */
export const TIME_WINDOW_DAYS: Record<Exclude<TimeWindow, "all">, number> = {
  "7d": 7,
  "3d": 3,
};

export function isTimeWindow(value: unknown): value is TimeWindow {
  return typeof value === "string" && (TIME_WINDOWS as readonly string[]).includes(value);
}

export interface GameCategoryRow {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
}

export interface GameNameRow {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  sort_direction: SortDirection;
  top_n: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface UserRow {
  id: string;
  display_name: string;
  created_at: string;
}

export interface LeaderboardRow {
  id: string;
  user_id: string | null;
  custom_username: string | null;
  score: number;
  game_category_id: string;
  game_name_id: string;
  created_at: string;
}

export interface HeartbeatRow {
  id: boolean;
  beat_at: string;
  source: string | null;
  updated_at: string;
}

// -- Heartbeat status (GET/POST /api/heartbeat) ----------------------------

export interface HeartbeatStatus {
  /** ISO timestamp of the most recent heartbeat, or null if none recorded. */
  beatAt: string | null;
  source: string | null;
  /** Age of the latest heartbeat in ms at response time, or null if none. */
  ageMs: number | null;
  /** True when the latest heartbeat is older than `staleAfterMs`. */
  stale: boolean;
  staleAfterMs: number;
}

// -- Board payload (GET /api/leaderboard) -----------------------------------

export interface BoardEntry {
  rank: number;
  id: string | null;
  displayName: string | null;
  score: number | null;
  createdAt: string | null;
}

export interface BoardGame {
  id: string;
  name: string;
  slug: string;
  sortDirection: SortDirection;
  topN: number;
  entries: BoardEntry[];
}

export interface BoardCategory {
  id: string;
  name: string;
  slug: string;
  games: BoardGame[];
}

export interface BoardPayload {
  updatedAt: string;
  /** Time interval this payload was filtered to. */
  interval: TimeWindow;
  categories: BoardCategory[];
}
