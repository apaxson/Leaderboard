import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, parseJsonBody, serverError } from "@/lib/adminHelpers";
import type { GameNameRow } from "@/lib/types";

interface UpdateScoreBody {
  game_name_id?: string;
  score?: number;
  user_id?: string | null;
  custom_username?: string | null;
  created_at?: string;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseJsonBody<UpdateScoreBody>(request);
  if (!body) return badRequest("Invalid JSON body");

  const supabase = getSupabaseAdmin();
  const update: Record<string, unknown> = {};

  if (body.game_name_id !== undefined) {
    const { data: game, error: gameError } = await supabase
      .from("game_names")
      .select("*")
      .eq("id", body.game_name_id)
      .maybeSingle<GameNameRow>();
    if (gameError) return serverError(gameError, "Failed to look up game");
    if (!game) return badRequest("Unknown game_name_id");
    update.game_name_id = game.id;
    update.game_category_id = game.category_id;
  }
  if (body.score !== undefined) {
    if (typeof body.score !== "number" || !Number.isFinite(body.score)) {
      return badRequest("score must be a finite number");
    }
    update.score = body.score;
  }
  if (body.user_id !== undefined) update.user_id = body.user_id;
  if (body.custom_username !== undefined) {
    update.custom_username = body.custom_username ? body.custom_username.trim() : null;
  }
  if (body.created_at !== undefined) update.created_at = body.created_at;

  const { data, error } = await supabase
    .from("leaderboard")
    .update(update)
    .eq("id", id)
    .select(
      "*, user:users(id,display_name), game:game_names(id,name,category:game_categories(id,name))"
    )
    .single();

  if (error) return serverError(error, "Failed to update score");
  return NextResponse.json({ score: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("leaderboard").delete().eq("id", id);
  if (error) return serverError(error, "Failed to delete score");
  return NextResponse.json({ ok: true });
}
