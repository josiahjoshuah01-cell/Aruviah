"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { searchCjProducts } from "@/app/admin/staging/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/lib/types";

export function CjSearchForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await searchCjProducts(keyword, categorySlug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Staged "${result.title}" (${result.variantCount} variant${result.variantCount === 1 ? "" : "s"}).`
      );
      setKeyword("");
      router.refresh();
    });
  }

  const disabled = isPending || categories.length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="mb-4">
        <h2 className="font-display text-sm font-semibold">Search CJ catalog</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Finds one matching product and adds it to the pending review queue below.
          This may take a few seconds while CJ variant data is fetched.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_minmax(10rem,12rem)_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="cj-search-keyword">Keyword</Label>
          <Input
            id="cj-search-keyword"
            placeholder='e.g. "wireless earbuds"'
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            disabled={disabled}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cj-search-category">Category</Label>
          <select
            id="cj-search-category"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            disabled={disabled}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream disabled:cursor-not-allowed disabled:opacity-50"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" disabled={disabled} className="sm:mb-0">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Search CJ
            </>
          )}
        </Button>
      </div>

      {isPending && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Querying CJ product list and variant inventory — please wait…
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-coral-pulse" role="alert">
          {error}
        </p>
      )}

      {success && !isPending && (
        <p className="mt-3 text-sm text-stream" role="status">
          {success}
        </p>
      )}
    </form>
  );
}
