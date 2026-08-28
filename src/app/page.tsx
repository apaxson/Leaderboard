import { getBoardPayload } from "@/lib/leaderboard";
import { getHeartbeat } from "@/lib/heartbeat";
import LeaderboardBoard from "@/components/LeaderboardBoard";
import type { BoardPayload, HeartbeatStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initialData: BoardPayload | null = null;
  let initialError: string | null = null;
  let initialHeartbeat: HeartbeatStatus | null = null;

  try {
    initialData = await getBoardPayload();
  } catch (error) {
    console.error("Failed to load initial leaderboard data", error);
    initialError =
      error instanceof Error ? error.message : "Failed to load leaderboard data";
  }

  try {
    initialHeartbeat = await getHeartbeat();
  } catch (error) {
    console.error("Failed to load initial heartbeat", error);
  }

  return (
    <LeaderboardBoard
      initialData={initialData}
      initialError={initialError}
      initialHeartbeat={initialHeartbeat}
    />
  );
}
