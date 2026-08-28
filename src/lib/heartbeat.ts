import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { HeartbeatRow, HeartbeatStatus } from "@/lib/types";

/**
 * How old the latest heartbeat may be before the board treats the feed as
 * broken. Kept here so the API and the client agree on the threshold; the
 * client re-derives staleness locally between polls, but this value is the
 * source of truth reported by GET /api/heartbeat.
 */
export const HEARTBEAT_STALE_MS = 90_000;

/** The singleton row's primary key (see 0002_heartbeat.sql). */
const HEARTBEAT_ROW_ID = true;

/**
 * Record a heartbeat. `beatAt` defaults to now; callers may pass an explicit
 * ISO timestamp (e.g. the moment their upstream sync actually completed).
 */
export async function recordHeartbeat(options?: {
  beatAt?: string;
  source?: string | null;
}): Promise<HeartbeatStatus> {
  const supabase = getSupabaseAdmin();
  const beatAt = options?.beatAt ?? new Date().toISOString();

  const { data, error } = await supabase
    .from("heartbeat")
    .upsert(
      {
        id: HEARTBEAT_ROW_ID,
        beat_at: beatAt,
        source: options?.source ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("*")
    .single<HeartbeatRow>();

  if (error) throw error;
  return toStatus(data);
}

/** Read the latest heartbeat and whether it is now considered stale. */
export async function getHeartbeat(): Promise<HeartbeatStatus> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("heartbeat")
    .select("*")
    .eq("id", HEARTBEAT_ROW_ID)
    .maybeSingle<HeartbeatRow>();

  if (error) throw error;
  return toStatus(data);
}

function toStatus(row: HeartbeatRow | null): HeartbeatStatus {
  if (!row) {
    return { beatAt: null, source: null, ageMs: null, stale: true, staleAfterMs: HEARTBEAT_STALE_MS };
  }
  const ageMs = Math.max(0, Date.now() - new Date(row.beat_at).getTime());
  return {
    beatAt: row.beat_at,
    source: row.source,
    ageMs,
    stale: ageMs > HEARTBEAT_STALE_MS,
    staleAfterMs: HEARTBEAT_STALE_MS,
  };
}
