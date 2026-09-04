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
// How many game cards fit on one page is measured at runtime from the actual
// category-box width (see CategoryBlock): we show as many cards as keep each
// one at least MIN_CARD_WIDTH_PX wide, so the player name and score always
// have room and never get clipped. A category with more games than fit slides
// to the next page every ROTATE_MS. The first category shares its row with the
// logo, so it measures narrower and pages sooner -- that falls out of
// measuring content width and needs no special case.
const MIN_CARD_WIDTH_PX = 380;
// Per-category floor overrides. Pinball cards carry only a top-3 list and a
// compact score, so they stay readable a bit narrower than the default -- a
// tighter floor lets a 5th machine share the row on the 1080p board.
const CATEGORY_MIN_CARD_WIDTH_PX: Record<string, number> = {
  pinball: 340,
};

function minCardWidthFor(slug: string): number {
  return CATEGORY_MIN_CARD_WIDTH_PX[slug] ?? MIN_CARD_WIDTH_PX;
}
// Matches the `gap-3` (0.75rem) between cards in the grid below.
const CARD_GAP_PX = 12;
// Used only for the server render and the first client paint, before the
// effect below measures the real width.
const FALLBACK_PER_PAGE = 4;
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
        <h3 className="text-lg font-bold uppercase leading-tight tracking-wide text-slate-200 [overflow-wrap:anywhere] md:text-xl">
          {game.name}
        </h3>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col justify-stretch">
        {game.entries.map((entry) => (
          <li
            key={entry.rank}
            className="flex flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-white/5 px-4 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 items-baseline gap-3">
              <span
                className={`w-6 shrink-0 text-right font-black tabular-nums ${
                  RANK_STYLES[entry.rank] ?? "text-slate-500"
                }`}
              >
                {entry.rank}
              </span>
              <span className="font-semibold leading-tight text-slate-100 [overflow-wrap:anywhere]">
                {entry.displayName ?? "—"}
              </span>
            </span>
            <span className="ml-auto shrink-0 font-black tabular-nums text-emerald-400">
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

  // How many game cards fit on one page, measured from the games area's actual
  // content width (which already excludes the logo reserve on the first
  // category). We keep every card at least MIN_CARD_WIDTH_PX wide so the name
  // and score always have room; the rest of the games slide in as extra pages.
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState<number | null>(null);
  const minCardWidthPx = minCardWidthFor(category.slug);

  useEffect(() => {
    const el = gridAreaRef.current;
    if (!el) return;
    const measure = (width: number) => {
      if (width <= 0) return; // not laid out yet -- keep the fallback
      const fit = Math.floor((width + CARD_GAP_PX) / (minCardWidthPx + CARD_GAP_PX));
      const next = Math.max(1, fit);
      setPerPage((prev) => (prev === next ? prev : next));
    };
    const measureNow = () => {
      const style = getComputedStyle(el);
      measure(
        el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      );
    };
    // Measure straight away so the card count is right on the first client
    // render, even in contexts where ResizeObserver notifications are throttled
    // (e.g. a background tab). `cornerReservePx` in the deps re-measures when
    // the logo's reserved width settles.
    measureNow();
    // `main` pins each category to a fixed width (see gridTemplateColumns
    // there), so this box's width never depends on how many cards we choose to
    // show -- the observer settles after one pass instead of looping.
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [cornerReservePx, minCardWidthPx]);

  const gamesPerPage = perPage ?? FALLBACK_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(category.games.length / gamesPerPage));
  const page = rotationTick % totalPages;
  const pages = Array.from({ length: totalPages }, (_, i) =>
    category.games.slice(i * gamesPerPage, i * gamesPerPage + gamesPerPage)
  );

  const gridStyle = {
    gridTemplateColumns: `repeat(${gamesPerPage}, minmax(0, 1fr))`,
    gridAutoRows: "1fr",
  } as const;

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
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
      {/* Outer box reserves the logo's width on the right (padding). The inner
          box is the actual visible window: its own edge sits where that reserve
          begins, so `overflow-hidden` clips the sliding track's off-screen
          pages there instead of letting them show through under the logo. */}
      <div
        className="min-h-0 min-w-0 flex-1"
        style={{ paddingRight: gridPaddingRight }}
      >
        <div
          ref={gridAreaRef}
          className="relative h-full overflow-hidden pt-4 pb-4 pl-4"
        >
          {category.games.length === 0 ? (
            <p className="flex h-full items-center justify-center text-slate-500">No games yet</p>
          ) : (
            <div
              className="game-page-track flex h-full transition-transform duration-700 ease-in-out"
              style={{
                width: `${totalPages * 100}%`,
                transform: `translateX(-${(page * 100) / totalPages}%)`,
              }}
            >
              {pages.map((pageGames, i) => (
                <div
                  key={i}
                  className="grid h-full shrink-0 gap-3"
                  style={{ ...gridStyle, width: `${100 / totalPages}%` }}
                >
                  {pageGames.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function LeaderboardBoard({
  initialData,
  initialError,
  initialHeartbeat,
  initialInterval = "all",
  boardUrl,
}: {
  initialData: BoardPayload | null;
  initialError: string | null;
  initialHeartbeat: HeartbeatStatus | null;
  /** Time interval to start on, resolved from the `?interval=` URL param. */
  initialInterval?: TimeWindow;
  /** LAN URL for this board, resolved server-side (system IP, not localhost). */
  boardUrl?: string;
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
          className="grid min-h-0 min-w-0 flex-1 gap-4"
          style={{
            // Explicit single column so each category's width is fixed by the
            // grid, never derived from its contents. Without this, the
            // percentage-width sliding track inside CategoryBlock and the
            // column size feed back into each other (cyclic sizing) and the
            // layout thrashes.
            gridTemplateColumns: "minmax(0, 1fr)",
            gridTemplateRows: `repeat(${Math.max(categories.length, 1)}, minmax(0, 1fr))`,
          }}
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
          <span className="flex flex-col pl-[25px]">
            <span className="font-semibold tracking-wide uppercase">Game Room Leaderboard</span>
            <span className="text-xs text-slate-600 md:text-sm">© 2026 PaxTech Galactic Quadrant Syndicate and Alliance</span>
            {boardUrl && (
              <span className="text-[0.65rem] text-slate-600 md:text-xs">{boardUrl}</span>
            )}
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
          <span className="flex items-center gap-4 pr-[25px]">
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
