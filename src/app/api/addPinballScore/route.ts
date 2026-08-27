import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { GameCategoryRow, GameNameRow } from "@/lib/types";

const PINBALL_SLUG = "pinball";
const PINBALL_TOP_N = 3;
const PINBALL_SORT_DIRECTION = "asc";

interface AddPinballScoreBody {
  gameName?: string;
  gameNameId?: string;
  customUsername?: string;
  score?: number;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * POST /api/addPinballScore
 * Creates a score for a walk-up / guest player under the Pinball category.
 * Body: { gameName: string, customUsername: string, score: number }
 * (or { gameNameId } instead of gameName, to target an existing machine.)
 * If the named machine doesn't exist yet under Pinball, it's created
 * automatically (top 3, ascending) -- this is how "Various Games" grows.
 */
export async function POST(request: Request) {
  let body: AddPinballScoreBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { gameName, gameNameId, customUsername, score } = body;

  if (!customUsername || typeof customUsername !== "string" || !customUsername.trim()) {
    return NextResponse.json({ error: "customUsername is required" }, { status: 400 });
  }
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return NextResponse.json({ error: "score must be a finite number" }, { status: 400 });
  }
  if (!gameNameId && (!gameName || !gameName.trim())) {
    return NextResponse.json(
      { error: "Provide either gameNameId or gameName" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: pinballCategory, error: categoryError } = await supabase
    .from("game_categories")
    .select("*")
    .eq("slug", PINBALL_SLUG)
    .maybeSingle<GameCategoryRow>();
  if (categoryError) {
    console.error(categoryError);
    return NextResponse.json({ error: "Failed to look up Pinball category" }, { status: 500 });
  }
  if (!pinballCategory) {
    return NextResponse.json({ error: "Pinball category is not configured" }, { status: 500 });
  }

  let game: GameNameRow | null = null;

  if (gameNameId) {
    const { data, error } = await supabase
      .from("game_names")
      .select("*")
      .eq("id", gameNameId)
      .eq("category_id", pinballCategory.id)
      .maybeSingle<GameNameRow>();
    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to look up machine" }, { status: 500 });
    }
    game = data;
    if (!game) {
      return NextResponse.json({ error: "Unknown pinball machine" }, { status: 404 });
    }
  } else {
    const trimmedName = gameName!.trim();
    const { data: existing, error: findError } = await supabase
      .from("game_names")
      .select("*")
      .eq("category_id", pinballCategory.id)
      .ilike("name", trimmedName)
      .maybeSingle<GameNameRow>();
    if (findError) {
      console.error(findError);
      return NextResponse.json({ error: "Failed to look up machine" }, { status: 500 });
    }

    if (existing) {
      game = existing;
    } else {
      const { count, error: countError } = await supabase
        .from("game_names")
        .select("id", { count: "exact", head: true })
        .eq("category_id", pinballCategory.id);
      if (countError) {
        console.error(countError);
        return NextResponse.json({ error: "Failed to create machine" }, { status: 500 });
      }

      const { data: created, error: insertGameError } = await supabase
        .from("game_names")
        .insert({
          category_id: pinballCategory.id,
          name: trimmedName,
          slug: slugify(trimmedName),
          sort_direction: PINBALL_SORT_DIRECTION,
          top_n: PINBALL_TOP_N,
          sort_order: (count ?? 0) + 1,
        })
        .select("*")
        .single<GameNameRow>();
      if (insertGameError) {
        console.error(insertGameError);
        return NextResponse.json({ error: "Failed to create machine" }, { status: 500 });
      }
      game = created;
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("leaderboard")
    .insert({
      custom_username: customUsername.trim(),
      score,
      game_category_id: pinballCategory.id,
      game_name_id: game.id,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error(insertError);
    return NextResponse.json({ error: "Failed to save score" }, { status: 500 });
  }

  return NextResponse.json({ entry: inserted, game }, { status: 201 });
}
