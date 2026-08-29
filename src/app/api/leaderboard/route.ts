import { NextResponse } from "next/server";
import { getBoardPayload } from "@/lib/leaderboard";
import { isTimeWindow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const intervalParam = new URL(request.url).searchParams.get("interval");
  const interval = isTimeWindow(intervalParam) ? intervalParam : "all";

  try {
    const payload = await getBoardPayload(interval);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/leaderboard failed", error);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}
