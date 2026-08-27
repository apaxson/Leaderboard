import { NextResponse } from "next/server";
import { getBoardPayload } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getBoardPayload();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/leaderboard failed", error);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}
