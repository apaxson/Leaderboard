import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findOrCreateUser } from "@/lib/players";
import type { GameNameRow } from "@/lib/types";

interface AddScoreBody {
  gameNameId?: string;
  score?: number;
  userId?: string;
  displayName?: string;
}

/**
 * POST /api/addScore
 * Submits a score for a registered player against an existing game.
 * Body: { gameNameId: string, score: number, userId?: string, displayName?: string }
 * Exactly one of userId / displayName must be provided. A new displayName
 * is registered as a user automatically.
 */
export async function POST(request: Request) {
  let body: AddScoreBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { gameNameId, score, userId, displayName } = body;

  if (!gameNameId || typeof gameNameId !== "string") {
    return NextResponse.json({ error: "gameNameId is required" }, { status: 400 });
  }
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return NextResponse.json({ error: "score must be a finite number" }, { status: 400 });
  }
  if (!userId && !displayName) {
    return NextResponse.json(
      { error: "Provide either userId or displayName" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: game, error: gameError } = await supabase
    .from("game_names")
    .select("*")
    .eq("id", gameNameId)
    .maybeSingle<GameNameRow>();
  if (gameError) {
    console.error(gameError);
    return NextResponse.json({ error: "Failed to look up game" }, { status: 500 });
  }
  if (!game || !game.is_active) {
    return NextResponse.json({ error: "Unknown or inactive game" }, { status: 404 });
  }

  let resolvedUserId = userId ?? null;
  try {
    if (!resolvedUserId && displayName) {
      const user = await findOrCreateUser(supabase, displayName);
      resolvedUserId = user.id;
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to resolve user" }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("leaderboard")
    .insert({
      user_id: resolvedUserId,
      score,
      game_category_id: game.category_id,
      game_name_id: game.id,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error(insertError);
    return NextResponse.json({ error: "Failed to save score" }, { status: 500 });
  }

  return NextResponse.json({ entry: inserted }, { status: 201 });
}
