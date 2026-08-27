"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EntityManager, { type FieldConfig } from "./EntityManager";

type Tab = "categories" | "games" | "users" | "scores";

const TABS: { id: Tab; label: string }[] = [
  { id: "categories", label: "Categories" },
  { id: "games", label: "Games" },
  { id: "users", label: "Users" },
  { id: "scores", label: "Scores" },
];

interface LookupRow {
  id: string;
  [key: string]: unknown;
}

async function fetchList(endpoint: string, key: string): Promise<LookupRow[]> {
  const res = await fetch(endpoint);
  if (!res.ok) return [];
  const json = await res.json();
  return json[key] ?? [];
}

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("categories");
  const [categories, setCategories] = useState<LookupRow[]>([]);
  const [games, setGames] = useState<LookupRow[]>([]);
  const [users, setUsers] = useState<LookupRow[]>([]);

  useEffect(() => {
    fetchList("/api/admin/categories", "categories").then(setCategories);
    fetchList("/api/admin/games", "games").then(setGames);
    fetchList("/api/admin/users", "users").then(setUsers);
  }, [activeTab]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  const categoryFields: FieldConfig[] = [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "slug", label: "Slug", type: "text", required: true, placeholder: "table" },
    { key: "sort_order", label: "Sort order", type: "number" },
  ];

  const gameFields: FieldConfig[] = [
    {
      key: "category_id",
      label: "Category",
      type: "select",
      required: true,
      options: categories.map((c) => ({ value: c.id, label: String(c.name) })),
      readFrom: (row) => (row.category as LookupRow | undefined)?.id ?? row.category_id,
    },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "slug", label: "Slug", type: "text", required: true, placeholder: "air-hockey" },
    {
      key: "sort_direction",
      label: "Ranking",
      type: "select",
      required: true,
      options: [
        { value: "asc", label: "Ascending (lowest wins)" },
        { value: "desc", label: "Descending (highest wins)" },
      ],
    },
    { key: "top_n", label: "Show top", type: "number" },
    { key: "sort_order", label: "Sort order", type: "number" },
    { key: "is_active", label: "Active", type: "checkbox" },
  ];

  const userFields: FieldConfig[] = [
    { key: "display_name", label: "Display name", type: "text", required: true },
  ];

  const scoreFields: FieldConfig[] = [
    {
      key: "game_name_id",
      label: "Game",
      type: "select",
      required: true,
      options: games.map((g) => ({
        value: g.id,
        label: `${(g.category as LookupRow | undefined)?.name ?? ""} — ${g.name}`,
      })),
      readFrom: (row) => (row.game as LookupRow | undefined)?.id ?? row.game_name_id,
    },
    {
      key: "user_id",
      label: "Registered player",
      type: "select",
      options: users.map((u) => ({ value: u.id, label: String(u.display_name) })),
      readFrom: (row) => (row.user as LookupRow | undefined)?.id ?? row.user_id,
    },
    {
      key: "custom_username",
      label: "Guest name (if no player)",
      type: "text",
      placeholder: "Walk-up guest name",
    },
    { key: "score", label: "Score", type: "number", required: true, step: "any" },
    { key: "created_at", label: "Played at", type: "datetime" },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6 text-slate-100">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Leaderboard Admin</h1>
          <p className="text-sm text-slate-500">Manage categories, games, players, and scores.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-white/5"
          >
            View board
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-white/5"
          >
            Log out
          </button>
        </div>
      </header>

      <nav className="flex gap-2 border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold ${
              activeTab === tab.id
                ? "border-b-2 border-emerald-400 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "categories" && (
        <EntityManager
          title="Categories"
          endpoint="/api/admin/categories"
          responseKey="categories"
          singularKey="category"
          fields={categoryFields}
        />
      )}

      {activeTab === "games" && (
        <EntityManager
          title="Games"
          endpoint="/api/admin/games"
          responseKey="games"
          singularKey="game"
          fields={gameFields}
          refreshKey={categories.length}
          columns={[
            {
              key: "category",
              label: "Category",
              render: (row) => String((row.category as LookupRow | undefined)?.name ?? "—"),
            },
            { key: "name", label: "Name" },
            { key: "sort_direction", label: "Ranking" },
            { key: "top_n", label: "Top" },
            { key: "is_active", label: "Active", render: (row) => (row.is_active ? "Yes" : "No") },
          ]}
        />
      )}

      {activeTab === "users" && (
        <EntityManager
          title="Users"
          endpoint="/api/admin/users"
          responseKey="users"
          singularKey="user"
          fields={userFields}
        />
      )}

      {activeTab === "scores" && (
        <EntityManager
          title="Scores"
          endpoint="/api/admin/scores"
          responseKey="scores"
          singularKey="score"
          fields={scoreFields}
          refreshKey={games.length + users.length}
          columns={[
            {
              key: "game",
              label: "Game",
              render: (row) => String((row.game as LookupRow | undefined)?.name ?? "—"),
            },
            {
              key: "player",
              label: "Player",
              render: (row) =>
                String(
                  (row.user as LookupRow | undefined)?.display_name ??
                    row.custom_username ??
                    "—"
                ),
            },
            { key: "score", label: "Score" },
            {
              key: "created_at",
              label: "Played at",
              render: (row) => new Date(String(row.created_at)).toLocaleString(),
            },
          ]}
        />
      )}
    </div>
  );
}
