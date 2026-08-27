import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, parseJsonBody, serverError } from "@/lib/adminHelpers";

interface UpdateGameBody {
  category_id?: string;
  name?: string;
  slug?: string;
  sort_direction?: "asc" | "desc";
  top_n?: number;
  sort_order?: number;
  is_active?: boolean;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseJsonBody<UpdateGameBody>(request);
  if (!body) return badRequest("Invalid JSON body");
  if (body.sort_direction !== undefined && body.sort_direction !== "asc" && body.sort_direction !== "desc") {
    return badRequest("sort_direction must be 'asc' or 'desc'");
  }

  const update: Record<string, unknown> = {};
  if (body.category_id !== undefined) update.category_id = body.category_id;
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.slug !== undefined) update.slug = body.slug.trim();
  if (body.sort_direction !== undefined) update.sort_direction = body.sort_direction;
  if (body.top_n !== undefined) update.top_n = body.top_n;
  if (body.sort_order !== undefined) update.sort_order = body.sort_order;
  if (body.is_active !== undefined) update.is_active = body.is_active;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("game_names")
    .update(update)
    .eq("id", id)
    .select("*, category:game_categories(id,name,slug)")
    .single();

  if (error) return serverError(error, "Failed to update game");
  return NextResponse.json({ game: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("game_names").delete().eq("id", id);
  if (error) return serverError(error, "Failed to delete game");
  return NextResponse.json({ ok: true });
}
