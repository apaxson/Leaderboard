"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardCategory, BoardGame, BoardPayload } from "@/lib/types";

const REFRESH_MS = 20_000;
const FETCH_TIMEOUT_MS = 10_000;
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

function CategoryBlock({ category }: { category: BoardCategory }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-6 py-3">
        <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${accentFor(category.slug)}`} />
        <h2 className="text-2xl font-extrabold uppercase tracking-tight text-white md:text-3xl">
          {category.name}
        </h2>
      </header>
      <div
        className="grid flex-1 gap-3 p-4"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
          gridAutoRows: "1fr",
        }}
      >
        {category.games.length === 0 ? (
          <p className="flex items-center justify-center text-slate-500">No games yet</p>
        ) : (
          category.games.map((game) => <GameCard key={game.id} game={game} />)
        )}
      </div>
    </section>
  );
}

export default function LeaderboardBoard({
  initialData,
  initialError,
}: {
  initialData: BoardPayload | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<BoardPayload | null>(initialData);
  const [isOffline, setIsOffline] = useState(!initialData && !!initialError);
  const inFlightController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inFlightController.current?.abort();
    const controller = new AbortController();
    inFlightController.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch("/api/leaderboard", {
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
  }, []);

  useEffect(() => {
    const intervalId = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(intervalId);
      inFlightController.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    const timeoutId = setTimeout(() => window.location.reload(), msUntilNextReload());
    return () => clearTimeout(timeoutId);
  }, []);

  const categories = data?.categories ?? [];

  return (
    <div className="kiosk-board flex flex-col gap-4 bg-[#0b0d12] p-6">
      <main
        className="grid min-h-0 flex-1 gap-4"
        style={{ gridTemplateRows: `repeat(${Math.max(categories.length, 1)}, minmax(0, 1fr))` }}
      >
        {categories.length === 0 ? (
          <div className="flex items-center justify-center text-2xl font-bold text-slate-500">
            {initialError ?? "No categories configured yet"}
          </div>
        ) : (
          categories.map((category) => <CategoryBlock key={category.id} category={category} />)
        )}
      </main>

      <footer className="flex shrink-0 items-center justify-between px-1 text-sm text-slate-500 md:text-base">
        <span className="font-semibold tracking-wide uppercase">Game Room Leaderboard</span>
        <span className="flex items-center gap-2 tabular-nums">
          <span
            className={`h-2 w-2 rounded-full ${isOffline ? "bg-red-500" : "bg-emerald-500"}`}
          />
          {data ? `Last updated ${formatTime(data.updatedAt)}` : "Waiting for data…"}
        </span>
      </footer>
    </div>
  );
}
