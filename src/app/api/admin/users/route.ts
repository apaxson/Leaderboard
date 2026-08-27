import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, isNonEmptyString, parseJsonBody, serverError } from "@/lib/adminHelpers";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) return serverError(error, "Failed to list users");
  return NextResponse.json({ users: data });
}

interface CreateUserBody {
  display_name?: string;
}

export async function POST(request: Request) {
  const body = await parseJsonBody<CreateUserBody>(request);
  if (!body) return badRequest("Invalid JSON body");
  if (!isNonEmptyString(body.display_name)) return badRequest("display_name is required");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .insert({ display_name: body.display_name.trim() })
    .select("*")
    .single();

  if (error) return serverError(error, "Failed to create user");
  return NextResponse.json({ user: data }, { status: 201 });
}
