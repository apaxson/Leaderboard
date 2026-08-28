import { NextResponse } from "next/server";
import { getHeartbeat, recordHeartbeat } from "@/lib/heartbeat";

export const dynamic = "force-dynamic";

interface HeartbeatBody {
  /** Optional explicit ISO-8601 timestamp; defaults to the server's now(). */
  timestamp?: string;
  /** Optional label for whoever/whatever sent the beat (shown in logs/admin). */
  source?: string;
}

/**
 * POST /api/heartbeat
 * Records the latest heartbeat timestamp. Send an empty body to stamp "now",
 * or { timestamp: "<ISO-8601>" } to record a specific moment.
 * The kiosk board polls GET /api/heartbeat and shows a red sync error in the
 * footer once the latest beat is more than 90 seconds old.
 */
export async function POST(request: Request) {
  let body: HeartbeatBody = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as HeartbeatBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  let beatAt: string | undefined;
  if (body.timestamp !== undefined) {
    const parsed = new Date(body.timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "timestamp must be a valid ISO-8601 date string" },
        { status: 400 }
      );
    }
    beatAt = parsed.toISOString();
  }

  let source: string | null | undefined;
  if (body.source !== undefined) {
    if (typeof body.source !== "string") {
      return NextResponse.json({ error: "source must be a string" }, { status: 400 });
    }
    source = body.source.trim() || null;
  }

  try {
    const status = await recordHeartbeat({ beatAt, source });
    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    console.error("POST /api/heartbeat failed", error);
    return NextResponse.json({ error: "Failed to record heartbeat" }, { status: 500 });
  }
}

/**
 * GET /api/heartbeat
 * Returns the latest heartbeat and whether it is now considered stale.
 */
export async function GET() {
  try {
    const status = await getHeartbeat();
    return NextResponse.json(status);
  } catch (error) {
    console.error("GET /api/heartbeat failed", error);
    return NextResponse.json({ error: "Failed to load heartbeat" }, { status: 500 });
  }
}
