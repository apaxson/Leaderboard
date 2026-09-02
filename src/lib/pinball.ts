import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameCategoryRow, GameNameRow } from "@/lib/types";

const PINBALL_SLUG = "pinball";
const PINBALL_TOP_N = 3;
// Pinball is high-score-wins: the biggest number ranks first.
const PINBALL_SORT_DIRECTION = "desc";

/** Carries the HTTP status a route should respond with for this failure. */
export class PinballLookupError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function getPinballCategory(supabase: SupabaseClient): Promise<GameCategoryRow> {
  const { data, error } = await supabase
    .from("game_categories")
    .select("*")
    .eq("slug", PINBALL_SLUG)
    .maybeSingle<GameCategoryRow>();
  if (error) throw new PinballLookupError("Failed to look up Pinball category", 500);
  if (!data) throw new PinballLookupError("Pinball category is not configured", 500);
  return data;
}

/**
 * Resolves a pinball machine by id (must already exist) or by name (created
 * automatically -- top 3, descending (high score wins) -- if it doesn't exist yet under
 * Pinball). This is how "Various Games" grows as machines are first played.
 */
export async function findOrCreatePinballGame(
  supabase: SupabaseClient,
  category: GameCategoryRow,
  { gameNameId, gameName }: { gameNameId?: string; gameName?: string }
): Promise<GameNameRow> {
  if (gameNameId) {
    const { data, error } = await supabase
      .from("game_names")
      .select("*")
      .eq("id", gameNameId)
      .eq("category_id", category.id)
      .maybeSingle<GameNameRow>();
    if (error) throw new PinballLookupError("Failed to look up machine", 500);
    if (!data) throw new PinballLookupError("Unknown pinball machine", 404);
    return data;
  }

  const trimmedName = gameName!.trim();
  const { data: existing, error: findError } = await supabase
    .from("game_names")
    .select("*")
    .eq("category_id", category.id)
    .ilike("name", trimmedName)
    .maybeSingle<GameNameRow>();
  if (findError) throw new PinballLookupError("Failed to look up machine", 500);
  if (existing) return existing;

  const { count, error: countError } = await supabase
    .from("game_names")
    .select("id", { count: "exact", head: true })
    .eq("category_id", category.id);
  if (countError) throw new PinballLookupError("Failed to create machine", 500);

  const { data: created, error: insertGameError } = await supabase
    .from("game_names")
    .insert({
      category_id: category.id,
      name: trimmedName,
      slug: slugify(trimmedName),
      sort_direction: PINBALL_SORT_DIRECTION,
      top_n: PINBALL_TOP_N,
      sort_order: (count ?? 0) + 1,
    })
    .select("*")
    .single<GameNameRow>();
  if (insertGameError) throw new PinballLookupError("Failed to create machine", 500);
  return created;
}
