import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, parseJsonBody, serverError } from "@/lib/adminHelpers";

interface UpdateCategoryBody {
  name?: string;
  slug?: string;
  sort_order?: number;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseJsonBody<UpdateCategoryBody>(request);
  if (!body) return badRequest("Invalid JSON body");

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.slug !== undefined) update.slug = body.slug.trim();
  if (body.sort_order !== undefined) update.sort_order = body.sort_order;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("game_categories")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return serverError(error, "Failed to update category");
  return NextResponse.json({ category: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("game_categories").delete().eq("id", id);
  if (error) return serverError(error, "Failed to delete category");
  return NextResponse.json({ ok: true });
}
