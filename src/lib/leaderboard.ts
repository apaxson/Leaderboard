import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  BoardCategory,
  BoardGame,
  BoardPayload,
  GameCategoryRow,
  GameNameRow,
  LeaderboardRow,
  UserRow,
} from "@/lib/types";

/**
 * Builds the full TV-board payload: every active category, every active game
 * within it, and each game's top N entries (ranked per its own sort
 * direction). Shared by GET /api/leaderboard and the server-rendered home
 * page so the kiosk's first paint doesn't need an extra network round trip.
 */
export async function getBoardPayload(): Promise<BoardPayload> {
  const supabase = getSupabaseAdmin();

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
    const { data: lbRows, error: lbError } = await supabase
      .from("leaderboard")
      .select("*")
      .in("game_name_id", gameIds)
      .order("created_at", { ascending: true })
      .returns<LeaderboardRow[]>();
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
    categories: boardCategories,
  };
}
