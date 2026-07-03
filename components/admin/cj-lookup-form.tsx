"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
import { lookupCjProduct } from "@/app/admin/staging/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/lib/types";

export function CjLookupForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await lookupCjProduct(identifier, categorySlug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Staged "${result.title}" (${result.variantCount} variant${result.variantCount === 1 ? "" : "s"}).`
      );
      setIdentifier("");
      router.refresh();
    });
  }

  const disabled = isPending || categories.length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-dashed border-stream/40 bg-card/60 p-5 shadow-sm"
    >
      <div className="mb-4">
        <h2 className="font-display text-sm font-semibold">
          Add specific product by ID
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Use this when you already found a specific product on CJ and know its
          product ID, product SKU, or variant SKU (the code shown on the variant row).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_minmax(10rem,12rem)_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="cj-lookup-id">CJ product ID or SKU</Label>
          <Input
            id="cj-lookup-id"
            placeholder="e.g. 2511060704591611100 or CJYD258310312LO"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={disabled}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cj-lookup-category">Category</Label>
          <select
            id="cj-lookup-category"
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

        <Button type="submit" disabled={disabled} variant="secondary">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding…
            </>
          ) : (
            <>
              <Link2 className="mr-2 h-4 w-4" />
              Add Product
            </>
          )}
        </Button>
      </div>

      {isPending && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Looking up product on CJ and fetching variant inventory — please wait…
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
