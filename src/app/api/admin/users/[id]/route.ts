import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, parseJsonBody, serverError } from "@/lib/adminHelpers";

interface UpdateUserBody {
  display_name?: string;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseJsonBody<UpdateUserBody>(request);
  if (!body) return badRequest("Invalid JSON body");

  const update: Record<string, unknown> = {};
  if (body.display_name !== undefined) update.display_name = body.display_name.trim();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return serverError(error, "Failed to update user");
  return NextResponse.json({ user: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) return serverError(error, "Failed to delete user");
  return NextResponse.json({ ok: true });
}
