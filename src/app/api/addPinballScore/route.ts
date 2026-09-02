import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findOrCreatePinballGame, getPinballCategory, PinballLookupError } from "@/lib/pinball";

interface AddPinballScoreBody {
  gameName?: string;
  gameNameId?: string;
  customUsername?: string;
  score?: number;
}

/**
 * POST /api/addPinballScore
 * Creates a score for a walk-up / guest player under the Pinball category.
 * Body: { gameName: string, customUsername: string, score: number }
 * (or { gameNameId } instead of gameName, to target an existing machine.)
 * If the named machine doesn't exist yet under Pinball, it's created
 * automatically (top 3, descending -- high score wins) -- this is how "Various Games" grows.
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

  let category, game;
  try {
    category = await getPinballCategory(supabase);
    game = await findOrCreatePinballGame(supabase, category, { gameNameId, gameName });
  } catch (error) {
    if (error instanceof PinballLookupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to resolve machine" }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("leaderboard")
    .insert({
      custom_username: customUsername.trim(),
      score,
      game_category_id: category.id,
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
