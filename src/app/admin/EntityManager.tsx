"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

export type FieldType = "text" | "number" | "select" | "checkbox" | "datetime";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  options?: FieldOption[];
  required?: boolean;
  placeholder?: string;
  step?: string;
  /** Row property to read the current value from, if different from `key`
   * (e.g. reading `category.id` for a `category_id` select field). */
  readFrom?: (row: Record<string, unknown>) => unknown;
}

export interface ColumnConfig {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => ReactNode;
}

type Row = Record<string, unknown> & { id: string };

function defaultFormValues(fields: FieldConfig[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.key] = field.type === "checkbox" ? "true" : "";
  }
  return values;
}

function rowToFormValues(row: Row, fields: FieldConfig[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = field.readFrom ? field.readFrom(row) : row[field.key];
    if (raw === null || raw === undefined) {
      values[field.key] = "";
    } else if (field.type === "datetime" && typeof raw === "string") {
      values[field.key] = raw.slice(0, 16);
    } else {
      values[field.key] = String(raw);
    }
  }
  return values;
}

function coerceValue(field: FieldConfig, raw: string): unknown {
  if (raw === "") return field.type === "select" ? null : field.required ? "" : null;
  if (field.type === "number") return Number(raw);
  if (field.type === "checkbox") return raw === "true";
  if (field.type === "datetime") return new Date(raw).toISOString();
  return raw;
}

function buildPayload(fields: FieldConfig[], values: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    payload[field.key] = coerceValue(field, values[field.key] ?? "");
  }
  return payload;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: string;
  onChange: (value: string) => void;
}) {
  const baseClass =
    "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400";

  if (field.type === "select") {
    return (
      <select className={baseClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <select className={baseClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  return (
    <input
      className={baseClass}
      type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
      step={field.step}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function EntityManager({
  title,
  endpoint,
  responseKey,
  singularKey,
  fields,
  columns,
  refreshKey,
}: {
  title: string;
  endpoint: string;
  responseKey: string;
  singularKey: string;
  fields: FieldConfig[];
  columns?: ColumnConfig[];
  /** Bump this (e.g. active tab) to force a refetch when lookups it depends on may have changed. */
  refreshKey?: unknown;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addValues, setAddValues] = useState(defaultFormValues(fields));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const displayColumns: ColumnConfig[] =
    columns ?? fields.map((f) => ({ key: f.key, label: f.label }));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = await res.json();
      setRows(json[responseKey] ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [endpoint, responseKey]);

  useEffect(() => {
    // Fetching on mount / when the endpoint or a lookup dependency changes is
    // the documented "synchronize with an external system" effect pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, refreshKey]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(fields, addValues)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed to add (${res.status})`);
      setRows((prev) => [json[singularKey], ...prev]);
      setAddValues(defaultFormValues(fields));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setEditValues(rowToFormValues(row, fields));
  }

  async function handleSaveEdit(id: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(fields, editValues)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed to save (${res.status})`);
      setRows((prev) => prev.map((r) => (r.id === id ? json[singularKey] : r)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this row? This cannot be undone.")) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed to delete (${res.status})`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-white">{title}</h2>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      >
        {fields.map((field) => (
          <label key={field.key} className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-slate-400">
            {field.label}
            <FieldInput
              field={field}
              value={addValues[field.key] ?? ""}
              onChange={(v) => setAddValues((prev) => ({ ...prev, [field.key]: v }))}
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={submitting}
          className="h-9 shrink-0 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
            <tr>
              {displayColumns.map((col) => (
                <th key={col.key} className="px-3 py-2 font-semibold">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={displayColumns.length + 1} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length + 1} className="px-3 py-6 text-center text-slate-500">
                  No rows yet
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="border-t border-white/5 align-middle">
                    {isEditing
                      ? fields.map((field) => (
                          <td key={field.key} className="px-3 py-2">
                            <FieldInput
                              field={field}
                              value={editValues[field.key] ?? ""}
                              onChange={(v) => setEditValues((prev) => ({ ...prev, [field.key]: v }))}
                            />
                          </td>
                        ))
                      : displayColumns.map((col) => (
                          <td key={col.key} className="px-3 py-2 text-slate-200">
                            {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                          </td>
                        ))}
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={submitting}
                            onClick={() => handleSaveEdit(row.id)}
                            className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(row)}
                            className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-white/5"
                          >
                            Edit
                          </button>
                          <button
                            disabled={submitting}
                            onClick={() => handleDelete(row.id)}
                            className="rounded-lg border border-red-500/30 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
