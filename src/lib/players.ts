import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRow } from "@/lib/types";

/** Finds a registered user by display name (case-insensitive), or creates one. */
export async function findOrCreateUser(
  supabase: SupabaseClient,
  displayName: string
): Promise<UserRow> {
  const trimmed = displayName.trim();

  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("*")
    .ilike("display_name", trimmed)
    .maybeSingle<UserRow>();
  if (findError) throw findError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({ display_name: trimmed })
    .select("*")
    .single<UserRow>();
  if (insertError) throw insertError;
  return created;
}
