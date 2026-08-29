import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  BoardCategory,
  BoardGame,
  BoardPayload,
  GameCategoryRow,
  GameNameRow,
  LeaderboardRow,
  TimeWindow,
  UserRow,
} from "@/lib/types";
import { TIME_WINDOW_DAYS } from "@/lib/types";

/**
 * ISO timestamp marking the start of a bounded time window, or null for
 * "all" (no lower bound). Used to filter leaderboard rows by `created_at`.
 */
function windowCutoffIso(window: TimeWindow): string | null {
  if (window === "all") return null;
  const days = TIME_WINDOW_DAYS[window];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Builds the full TV-board payload: every active category, every active game
 * within it, and each game's top N entries (ranked per its own sort
 * direction). Shared by GET /api/leaderboard and the server-rendered home
 * page so the kiosk's first paint doesn't need an extra network round trip.
 *
 * `interval` bounds which scores count by their `created_at`: "all" (default)
 * includes every entry, "7d" / "3d" only the last 7 / 3 days.
 */
export async function getBoardPayload(interval: TimeWindow = "all"): Promise<BoardPayload> {
  const supabase = getSupabaseAdmin();
  const cutoffIso = windowCutoffIso(interval);

  const [{ data: categories, error: categoriesError }, { data: games, error: gamesError }] =
    await Promise.all([
      supabase
        .from("game_categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .returns<GameCategoryRow[]>(),
      supabase
        .from("game_names")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .returns<GameNameRow[]>(),
    ]);

  if (categoriesError) throw categoriesError;
  if (gamesError) throw gamesError;

  const allGames = games ?? [];
  const gameIds = allGames.map((g) => g.id);

  let leaderboardRows: LeaderboardRow[] = [];
  let users: UserRow[] = [];

  if (gameIds.length > 0) {
    let lbQuery = supabase
      .from("leaderboard")
      .select("*")
      .in("game_name_id", gameIds)
      .order("created_at", { ascending: true });
    if (cutoffIso) lbQuery = lbQuery.gte("created_at", cutoffIso);

    const { data: lbRows, error: lbError } = await lbQuery.returns<LeaderboardRow[]>();
    if (lbError) throw lbError;
    leaderboardRows = lbRows ?? [];

    const userIds = Array.from(
      new Set(leaderboardRows.map((r) => r.user_id).filter((id): id is string => !!id))
    );
    if (userIds.length > 0) {
      const { data: userRows, error: userError } = await supabase
        .from("users")
        .select("*")
        .in("id", userIds)
        .returns<UserRow[]>();
      if (userError) throw userError;
      users = userRows ?? [];
    }
  }

  const userNameById = new Map(users.map((u) => [u.id, u.display_name]));
  const rowsByGame = new Map<string, LeaderboardRow[]>();
  for (const row of leaderboardRows) {
    const list = rowsByGame.get(row.game_name_id);
    if (list) list.push(row);
    else rowsByGame.set(row.game_name_id, [row]);
  }

  const gamesByCategory = new Map<string, GameNameRow[]>();
  for (const game of allGames) {
    const list = gamesByCategory.get(game.category_id);
    if (list) list.push(game);
    else gamesByCategory.set(game.category_id, [game]);
  }

  const boardCategories: BoardCategory[] = (categories ?? []).map((category) => {
    const categoryGames = gamesByCategory.get(category.id) ?? [];

    const boardGames: BoardGame[] = categoryGames.map((game) => {
      const rows = [...(rowsByGame.get(game.id) ?? [])];
      rows.sort((a, b) =>
        game.sort_direction === "asc" ? a.score - b.score : b.score - a.score
      );

      const entries = Array.from({ length: game.top_n }, (_, i) => {
        const row = rows[i];
        if (!row) {
          return { rank: i + 1, id: null, displayName: null, score: null, createdAt: null };
        }
        const displayName = row.custom_username ?? userNameById.get(row.user_id ?? "") ?? "Unknown";
        return {
          rank: i + 1,
          id: row.id,
          displayName,
          score: row.score,
          createdAt: row.created_at,
        };
      });

      return {
        id: game.id,
        name: game.name,
        slug: game.slug,
        sortDirection: game.sort_direction,
        topN: game.top_n,
        entries,
      };
    });

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      games: boardGames,
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    interval,
    categories: boardCategories,
  };
}
