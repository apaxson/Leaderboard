import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, isNonEmptyString, parseJsonBody, serverError } from "@/lib/adminHelpers";
import type { GameNameRow } from "@/lib/types";

const SCORES_LIMIT = 1000;

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leaderboard")
    .select(
      "*, user:users(id,display_name), game:game_names(id,name,category:game_categories(id,name))"
    )
    .order("created_at", { ascending: false })
    .limit(SCORES_LIMIT);
  if (error) return serverError(error, "Failed to list scores");
  return NextResponse.json({ scores: data });
}

interface CreateScoreBody {
  game_name_id?: string;
  score?: number;
  user_id?: string;
  custom_username?: string;
  created_at?: string;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<CreateScoreBody>(request);
  if (!body) return badRequest("Invalid JSON body");
  if (!isNonEmptyString(body.game_name_id)) return badRequest("game_name_id is required");
  if (typeof body.score !== "number" || !Number.isFinite(body.score)) {
    return badRequest("score must be a finite number");
  }
  const hasUser = isNonEmptyString(body.user_id);
  const hasCustom = isNonEmptyString(body.custom_username);
  if (!hasUser && !hasCustom) {
    return badRequest("Provide either user_id or custom_username");
  }

  const supabase = getSupabaseAdmin();
  const { data: game, error: gameError } = await supabase
    .from("game_names")
    .select("*")
    .eq("id", body.game_name_id)
    .maybeSingle<GameNameRow>();
  if (gameError) return serverError(gameError, "Failed to look up game");
  if (!game) return badRequest("Unknown game_name_id");

  const { data, error } = await supabase
    .from("leaderboard")
    .insert({
      game_name_id: game.id,
      game_category_id: game.category_id,
      score: body.score,
      user_id: hasUser ? body.user_id : null,
      custom_username: hasCustom ? body.custom_username!.trim() : null,
      ...(body.created_at ? { created_at: body.created_at } : {}),
    })
    .select(
      "*, user:users(id,display_name), game:game_names(id,name,category:game_categories(id,name))"
    )
    .single();

  if (error) return serverError(error, "Failed to create score");
  return NextResponse.json({ score: data }, { status: 201 });
}
