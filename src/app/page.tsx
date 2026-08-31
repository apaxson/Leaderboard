import { getBoardPayload } from "@/lib/leaderboard";
import { getHeartbeat } from "@/lib/heartbeat";
import { getBoardLanUrl } from "@/lib/serverUrl";
import LeaderboardBoard from "@/components/LeaderboardBoard";
import { isTimeWindow } from "@/lib/types";
import type { BoardPayload, HeartbeatStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const intervalParam = (await searchParams).interval;
  const interval = isTimeWindow(intervalParam) ? intervalParam : "all";

  let initialData: BoardPayload | null = null;
  let initialError: string | null = null;
  let initialHeartbeat: HeartbeatStatus | null = null;

  try {
    initialData = await getBoardPayload(interval);
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
      initialInterval={interval}
      boardUrl={getBoardLanUrl()}
    />
  );
}
