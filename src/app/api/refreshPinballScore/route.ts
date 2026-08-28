import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findOrCreatePinballGame, getPinballCategory, PinballLookupError } from "@/lib/pinball";

interface RefreshScoreEntry {
  customUsername?: string;
  score?: number;
}

interface RefreshPinballScoreBody {
  gameName?: string;
  gameNameId?: string;
  scores?: RefreshScoreEntry[];
}

interface SanitizedScore {
  custom_username: string;
  score: number;
}

/**
 * POST /api/refreshPinballScore
 * Wipes every existing score for one pinball machine and replaces it with
 * the full score list provided -- for a full resync rather than a single
 * new score (see POST /api/addPinballScore for that).
 * Body: { gameName: string, scores: [{ customUsername: string, score: number }, ...] }
 * (or { gameNameId } instead of gameName, to target an existing machine.)
 * If the named machine doesn't exist yet under Pinball, it's created
 * automatically (top 3, ascending), same as /api/addPinballScore.
 */
export async function POST(request: Request) {
  let body: RefreshPinballScoreBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { gameName, gameNameId, scores } = body;

  if (!gameNameId && (!gameName || !gameName.trim())) {
    return NextResponse.json(
      { error: "Provide either gameNameId or gameName" },
      { status: 400 }
    );
  }
  if (!Array.isArray(scores)) {
    return NextResponse.json({ error: "scores must be an array" }, { status: 400 });
  }

  const sanitizedScores: SanitizedScore[] = [];
  for (const [index, entry] of scores.entries()) {
    if (!entry || typeof entry !== "object") {
      return NextResponse.json({ error: `scores[${index}] must be an object` }, { status: 400 });
    }
    if (typeof entry.customUsername !== "string" || !entry.customUsername.trim()) {
      return NextResponse.json(
        { error: `scores[${index}].customUsername is required` },
        { status: 400 }
      );
    }
    if (typeof entry.score !== "number" || !Number.isFinite(entry.score)) {
      return NextResponse.json(
        { error: `scores[${index}].score must be a finite number` },
        { status: 400 }
      );
    }
    sanitizedScores.push({ custom_username: entry.customUsername.trim(), score: entry.score });
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

  const { error: deleteError, count: deletedCount } = await supabase
    .from("leaderboard")
    .delete({ count: "exact" })
    .eq("game_name_id", game.id);
  if (deleteError) {
    console.error(deleteError);
    return NextResponse.json({ error: "Failed to clear existing scores" }, { status: 500 });
  }

  let entries: unknown[] = [];
  if (sanitizedScores.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("leaderboard")
      .insert(
        sanitizedScores.map((s) => ({
          custom_username: s.custom_username,
          score: s.score,
          game_category_id: category.id,
          game_name_id: game.id,
        }))
      )
      .select("*");

    if (insertError) {
      console.error(insertError);
      // Existing scores are already gone at this point -- surface that clearly
      // so the caller knows to retry the whole request rather than assume
      // the old scores are still there.
      return NextResponse.json(
        {
          error:
            "Cleared existing scores but failed to insert the replacement set; retry the request",
          game,
        },
        { status: 500 }
      );
    }
    entries = inserted ?? [];
  }

  return NextResponse.json({ game, deletedCount: deletedCount ?? 0, entries }, { status: 200 });
}
