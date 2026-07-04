"use client";

import { useMemo, useState, useTransition } from "react";
import { updateCategorySection } from "./actions";
import type { AdminCategoryRow } from "@/lib/admin-queries";

type Props = {
  categories: AdminCategoryRow[];
  knownSections: string[];
};

export function CategoryTable({ categories, knownSections }: Props) {
  const [filter, setFilter] = useState("");

  const filtered = filter.trim()
    ? categories.filter(
        (c) =>
          c.name.toLowerCase().includes(filter.trim().toLowerCase()) ||
          c.slug.toLowerCase().includes(filter.trim().toLowerCase()) ||
          (c.section ?? "")
            .toLowerCase()
            .includes(filter.trim().toLowerCase())
      )
    : categories;

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by name, slug, or section…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full max-w-sm rounded-md border border-border bg-mist px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/40">
              <th className="px-4 py-2.5 text-left font-medium">Category</th>
              <th className="px-4 py-2.5 text-left font-medium">Slug</th>
              <th className="px-4 py-2.5 text-right font-medium">Products</th>
              <th className="px-4 py-2.5 text-left font-medium">Section</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                knownSections={knownSections}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No categories found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {categories.length} categor{categories.length !== 1 ? "ies" : "y"}.{" "}
        Sections are display labels for the storefront mega-menu only — categories
        stay flat in the database.
      </p>
    </div>
  );
}

function CategoryRow({
  category,
  knownSections,
}: {
  category: AdminCategoryRow;
  knownSections: string[];
}) {
  const [mode, setMode] = useState<"select" | "custom">(
    category.section &&
      !knownSections.includes(category.section)
      ? "custom"
      : "select"
  );
  const [customValue, setCustomValue] = useState(
    category.section &&
      !knownSections.includes(category.section)
      ? category.section
      : ""
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectValue = useMemo(() => {
    if (!category.section) return "";
    if (knownSections.includes(category.section)) return category.section;
    return "__custom__";
  }, [category.section, knownSections]);

  function save(section: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await updateCategorySection(category.id, section);
      if (!result.ok) setError(result.error);
    });
  }

  function handleSelectChange(value: string) {
    if (value === "__custom__") {
      setMode("custom");
      setCustomValue("");
      return;
    }
    if (value === "__clear__") {
      setMode("select");
      save(null);
      return;
    }
    setMode("select");
    save(value);
  }

  function handleCustomSave() {
    save(customValue);
    if (customValue.trim()) setMode("select");
  }

  return (
    <tr className={isPending ? "opacity-60" : undefined}>
      <td className="px-4 py-2.5 font-medium">{category.name}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
        {category.slug}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {category.product_count}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex min-w-[200px] flex-col gap-1">
          {mode === "select" ? (
            <select
              value={selectValue}
              onChange={(e) => handleSelectChange(e.target.value)}
              disabled={isPending}
              className="rounded-md border border-border bg-mist px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
            >
              <option value="">Unassigned (More)</option>
              {knownSections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {category.section &&
                !knownSections.includes(category.section) && (
                  <option value={category.section}>{category.section}</option>
                )}
              <option value="__custom__">+ Add new section…</option>
              {category.section && (
                <option value="__clear__">Clear section</option>
              )}
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New section name"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                disabled={isPending}
                className="min-w-0 flex-1 rounded-md border border-border bg-mist px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomSave();
                  if (e.key === "Escape") setMode("select");
                }}
              />
              <button
                type="button"
                onClick={handleCustomSave}
                disabled={isPending || !customValue.trim()}
                className="shrink-0 rounded-md border border-stream bg-stream/10 px-2 py-1.5 text-xs font-medium text-stream hover:bg-stream/20 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setMode("select")}
                disabled={isPending}
                className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-current"
              >
                Cancel
              </button>
            </div>
          )}
          {error && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
