import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, isNonEmptyString, parseJsonBody, serverError } from "@/lib/adminHelpers";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("game_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return serverError(error, "Failed to list categories");
  return NextResponse.json({ categories: data });
}

interface CreateCategoryBody {
  name?: string;
  slug?: string;
  sort_order?: number;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<CreateCategoryBody>(request);
  if (!body) return badRequest("Invalid JSON body");
  if (!isNonEmptyString(body.name)) return badRequest("name is required");
  if (!isNonEmptyString(body.slug)) return badRequest("slug is required");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("game_categories")
    .insert({
      name: body.name.trim(),
      slug: body.slug.trim(),
      sort_order: body.sort_order ?? 0,
    })
    .select("*")
    .single();

  if (error) return serverError(error, "Failed to create category");
  return NextResponse.json({ category: data }, { status: 201 });
}
