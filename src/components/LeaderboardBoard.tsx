"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BoardCategory,
  BoardGame,
  BoardPayload,
  HeartbeatStatus,
  TimeWindow,
} from "@/lib/types";
import { TIME_WINDOWS, TIME_WINDOW_LABELS } from "@/lib/types";

const REFRESH_MS = 20_000;
const FETCH_TIMEOUT_MS = 10_000;
const ROTATE_MS = 10_000;
// How often the footer re-checks POST /api/heartbeat, and how old the latest
// beat may be before the footer shows a red sync error. Must match
// HEARTBEAT_STALE_MS in src/lib/heartbeat.ts.
const HEARTBEAT_POLL_MS = 15_000;
const HEARTBEAT_STALE_MS = 90_000;
// Cadence for locally re-deriving heartbeat staleness between polls, so the
// error still appears if the poll itself stalls.
const HEARTBEAT_TICK_MS = 5_000;
// Max games shown at once per category. Table Games (5) and Card Games (3)
// never exceed this, so they never rotate; Pinball grows dynamically as
// machines are played, so once it passes this it starts paging.
const GAMES_PER_PAGE = 5;
// Kiosk browsers run for weeks at a time; forcing a full page reload once a
// day at an off-peak hour bounds any memory/DOM growth the tab accumulates,
// independent of how careful the polling code below is.
const DAILY_RELOAD_HOUR = 4; // 4:00 AM local time

const CATEGORY_ACCENTS: Record<string, string> = {
  table: "bg-sky-400",
  pinball: "bg-fuchsia-400",
  cards: "bg-amber-400",
};

function accentFor(slug: string): string {
  return CATEGORY_ACCENTS[slug] ?? "bg-emerald-400";
}

function msUntilNextReload(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(DAILY_RELOAD_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function formatScore(score: number): string {
  return score.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

const RANK_STYLES: Record<number, string> = {
  1: "text-amber-300",
  2: "text-slate-300",
  3: "text-orange-400",
};

function GameCard({ game }: { game: BoardGame }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/5 bg-black/30">
      <div className="shrink-0 border-b border-white/5 px-4 py-2">
        <h3 className="truncate text-lg font-bold uppercase tracking-wide text-slate-200 md:text-xl">
          {game.name}
        </h3>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col justify-stretch">
        {game.entries.map((entry) => (
          <li
            key={entry.rank}
            className="flex flex-1 items-center justify-between gap-3 border-b border-white/5 px-4 last:border-b-0"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`w-6 shrink-0 text-right font-black tabular-nums ${
                  RANK_STYLES[entry.rank] ?? "text-slate-500"
                }`}
              >
                {entry.rank}
              </span>
              <span className="truncate font-semibold text-slate-100">
                {entry.displayName ?? "—"}
              </span>
            </span>
            <span className="shrink-0 font-black tabular-nums text-emerald-400">
              {entry.score !== null ? formatScore(entry.score) : "—"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Buffer added on top of the logo's measured width, so cards don't butt
// right up against it.
const LOGO_RESERVE_GAP_PX = 24;
// Conservative guess used for the first paint, before the logo has loaded
// and been measured -- refined immediately after via ResizeObserver.
// The logo renders at w-1/3 of the board; ~640px on a 1920px-wide kiosk
// display, plus LOGO_RESERVE_GAP_PX.
const LOGO_RESERVE_FALLBACK_PX = 664;

function CategoryBlock({
  category,
  cornerReservePx,
  rotationTick,
}: {
  category: BoardCategory;
  /** When set, reserves this many px on the right so content flows around
   * the logo overlaid in that corner instead of running underneath it. */
  cornerReservePx?: number;
  /** Increments every ROTATE_MS; drives which page of games is shown when
   * a category has more games than fit on screen at once. */
  rotationTick: number;
}) {
  const headerPaddingRight = cornerReservePx ?? 24;
  const gridPaddingRight = cornerReservePx ?? 16;

  const totalPages = Math.max(1, Math.ceil(category.games.length / GAMES_PER_PAGE));
  const page = rotationTick % totalPages;
  const visibleGames =
    totalPages > 1
      ? category.games.slice(page * GAMES_PER_PAGE, page * GAMES_PER_PAGE + GAMES_PER_PAGE)
      : category.games;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <header
        className="flex shrink-0 items-center gap-3 border-b border-white/10 py-3 pl-6"
        style={{ paddingRight: headerPaddingRight }}
      >
        <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${accentFor(category.slug)}`} />
        <h2 className="text-2xl font-extrabold uppercase tracking-tight text-white md:text-3xl">
          {category.name}
        </h2>
        {totalPages > 1 && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === page ? "bg-white" : "bg-white/20"
                }`}
              />
            ))}
          </span>
        )}
      </header>
      <div
        key={page}
        className="game-page grid flex-1 gap-3 pt-4 pb-4 pl-4"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
          gridAutoRows: "1fr",
          paddingRight: gridPaddingRight,
        }}
      >
        {visibleGames.length === 0 ? (
          <p className="flex items-center justify-center text-slate-500">No games yet</p>
        ) : (
          visibleGames.map((game) => <GameCard key={game.id} game={game} />)
        )}
      </div>
    </section>
  );
}

export default function LeaderboardBoard({
  initialData,
  initialError,
  initialHeartbeat,
  initialInterval = "all",
}: {
  initialData: BoardPayload | null;
  initialError: string | null;
  initialHeartbeat: HeartbeatStatus | null;
  /** Time interval to start on, resolved from the `?interval=` URL param. */
  initialInterval?: TimeWindow;
}) {
  const [data, setData] = useState<BoardPayload | null>(initialData);
  const [isOffline, setIsOffline] = useState(!initialData && !!initialError);
  // Time range the board is filtered to, by score `created_at`. Seeded from
  // the `?interval=` URL param (defaults to "all" — every entry).
  const [selectedInterval, setSelectedInterval] = useState<TimeWindow>(
    initialData?.interval ?? initialInterval
  );
  const inFlightController = useRef<AbortController | null>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const [logoReservePx, setLogoReservePx] = useState(LOGO_RESERVE_FALLBACK_PX);
  const [rotationTick, setRotationTick] = useState(0);
  const [heartbeatAt, setHeartbeatAt] = useState<string | null>(
    initialHeartbeat?.beatAt ?? null
  );
  // Seeded from the server so the first client render matches; thereafter
  // updated by the poll and re-derived locally by the tick effect below.
  const [heartbeatStale, setHeartbeatStale] = useState(
    initialHeartbeat?.stale ?? true
  );

  const refresh = useCallback(async () => {
    inFlightController.current?.abort();
    const controller = new AbortController();
    inFlightController.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/leaderboard?interval=${selectedInterval}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const payload = (await res.json()) as BoardPayload;
      setData(payload);
      setIsOffline(false);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Failed to refresh leaderboard", error);
      }
      setIsOffline(true);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [selectedInterval]);

  useEffect(() => {
    const intervalId = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(intervalId);
      inFlightController.current?.abort();
    };
  }, [refresh]);

  // When the operator switches the interval, refetch right away (rather than
  // waiting for the next poll) and reflect the choice in the URL so it
  // survives a reload and can be shared/bookmarked.
  const isFirstIntervalRender = useRef(true);
  useEffect(() => {
    if (isFirstIntervalRender.current) {
      isFirstIntervalRender.current = false;
      return;
    }
    const url = new URL(window.location.href);
    if (selectedInterval === "all") url.searchParams.delete("interval");
    else url.searchParams.set("interval", selectedInterval);
    window.history.replaceState(null, "", url);
    refresh();
  }, [selectedInterval, refresh]);

  useEffect(() => {
    const timeoutId = setTimeout(() => window.location.reload(), msUntilNextReload());
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => setRotationTick((tick) => tick + 1), ROTATE_MS);
    return () => clearInterval(intervalId);
  }, []);

  const refreshHeartbeat = useCallback(async () => {
    try {
      const res = await fetch("/api/heartbeat", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const status = (await res.json()) as { beatAt: string | null; stale: boolean };
      setHeartbeatAt(status.beatAt);
      setHeartbeatStale(status.stale);
    } catch (error) {
      console.error("Failed to refresh heartbeat", error);
    }
  }, []);

  useEffect(() => {
    const intervalId = setInterval(refreshHeartbeat, HEARTBEAT_POLL_MS);
    return () => clearInterval(intervalId);
  }, [refreshHeartbeat]);

  // Re-derive staleness between polls so the sync error still appears (and
  // clears) on time even if a poll is delayed.
  useEffect(() => {
    const intervalId = setInterval(() => {
      const stale =
        heartbeatAt === null ||
        Date.now() - new Date(heartbeatAt).getTime() > HEARTBEAT_STALE_MS;
      setHeartbeatStale((prev) => (prev === stale ? prev : stale));
    }, HEARTBEAT_TICK_MS);
    return () => clearInterval(intervalId);
  }, [heartbeatAt]);

  useEffect(() => {
    const logoEl = logoRef.current;
    if (!logoEl) return;
    const observer = new ResizeObserver(([entry]) => {
      setLogoReservePx(Math.ceil(entry.contentRect.width) + LOGO_RESERVE_GAP_PX);
    });
    observer.observe(logoEl);
    return () => observer.disconnect();
  }, []);

  const categories = data?.categories ?? [];

  return (
    <div className="kiosk-board bg-[#0b0d12]">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-viewport kiosk display, not a page that benefits from next/image's responsive srcset */}
      <img
        ref={logoRef}
        src="/PaxsonGameSign_transparent.png"
        alt="Paxson Game Room"
        className="pointer-events-none absolute top-0 right-0 z-10 h-auto w-1/3 object-contain"
      />

      <div className="flex h-full flex-col gap-4 p-6">
        <main
          className="grid min-h-0 flex-1 gap-4"
          style={{ gridTemplateRows: `repeat(${Math.max(categories.length, 1)}, minmax(0, 1fr))` }}
        >
          {categories.length === 0 ? (
            <div className="flex items-center justify-center text-2xl font-bold text-slate-500">
              {initialError ?? "No categories configured yet"}
            </div>
          ) : (
            categories.map((category, index) => (
              <CategoryBlock
                key={category.id}
                category={category}
                cornerReservePx={index === 0 ? logoReservePx : undefined}
                rotationTick={rotationTick}
              />
            ))
          )}
        </main>

        <footer className="flex shrink-0 items-center justify-between px-1 text-sm text-slate-500 md:text-base">
          <span className="flex flex-col">
            <span className="font-semibold tracking-wide uppercase">Game Room Leaderboard</span>
            <span className="text-xs text-slate-600 md:text-sm">© 2026 PaxTech Galactic Enterprises</span>
          </span>
          <span
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1"
            role="group"
            aria-label="Time range"
          >
            {TIME_WINDOWS.map((win) => (
              <button
                key={win}
                type="button"
                onClick={() => setSelectedInterval(win)}
                aria-pressed={selectedInterval === win}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors md:text-sm ${
                  selectedInterval === win
                    ? "bg-white text-slate-900"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {TIME_WINDOW_LABELS[win]}
              </button>
            ))}
          </span>
          <span className="flex items-center gap-4">
            {heartbeatStale && (
              <span className="flex items-center gap-2 font-bold uppercase tracking-wide text-red-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Pinball Sync Error
              </span>
            )}
            <span className="flex items-center gap-2 tabular-nums">
              <span
                className={`h-2 w-2 rounded-full ${isOffline ? "bg-red-500" : "bg-emerald-500"}`}
              />
              {data ? `Last updated ${formatTime(data.updatedAt)}` : "Waiting for data…"}
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
}
