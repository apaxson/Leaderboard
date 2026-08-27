import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, isNonEmptyString, parseJsonBody, serverError } from "@/lib/adminHelpers";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("game_names")
    .select("*, category:game_categories(id,name,slug)")
    .order("sort_order", { ascending: true });
  if (error) return serverError(error, "Failed to list games");
  return NextResponse.json({ games: data });
}

interface CreateGameBody {
  category_id?: string;
  name?: string;
  slug?: string;
  sort_direction?: "asc" | "desc";
  top_n?: number;
  sort_order?: number;
  is_active?: boolean;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<CreateGameBody>(request);
  if (!body) return badRequest("Invalid JSON body");
  if (!isNonEmptyString(body.category_id)) return badRequest("category_id is required");
  if (!isNonEmptyString(body.name)) return badRequest("name is required");
  if (!isNonEmptyString(body.slug)) return badRequest("slug is required");
  if (body.sort_direction !== "asc" && body.sort_direction !== "desc") {
    return badRequest("sort_direction must be 'asc' or 'desc'");
  }
  if (!body.top_n || body.top_n < 1) return badRequest("top_n must be a positive number");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("game_names")
    .insert({
      category_id: body.category_id,
      name: body.name.trim(),
      slug: body.slug.trim(),
      sort_direction: body.sort_direction,
      top_n: body.top_n,
      sort_order: body.sort_order ?? 0,
      is_active: body.is_active ?? true,
    })
    .select("*, category:game_categories(id,name,slug)")
    .single();

  if (error) return serverError(error, "Failed to create game");
  return NextResponse.json({ game: data }, { status: 201 });
}
