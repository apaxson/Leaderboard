export type SortDirection = "asc" | "desc";

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
  categories: BoardCategory[];
}
