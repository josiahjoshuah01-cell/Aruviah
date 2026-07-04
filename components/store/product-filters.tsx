"use client";

import { useState } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { buildCatalogHref, catalogClearAllHref } from "@/lib/catalog-url";
import {
  countActiveFilters,
  type SearchParams,
} from "@/lib/validations";

const SORT_OPTIONS = [
  { value: "", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "bestselling", label: "Bestselling" },
] as const;

type ProductFiltersProps = {
  basePath: string;
  filters: SearchParams;
  availableSizes: string[];
  ignoreCategoryInCount?: boolean;
};

function FilterFields({
  basePath,
  filters,
  availableSizes,
  onNavigate,
  layout = "sidebar",
  idPrefix = "filter",
}: ProductFiltersProps & {
  onNavigate?: () => void;
  layout?: "sidebar" | "compact";
  idPrefix?: string;
}) {
  const isSidebar = layout === "sidebar";

  return (
    <div className="flex flex-col gap-6">
      {availableSizes.length > 0 && (
        <div className="space-y-2.5">
          <Label className="text-sm font-medium">Size</Label>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildCatalogHref(basePath, filters, {
                size: undefined,
                clear: ["size"],
              })}
              onClick={onNavigate}
              className={cn(
                "relative rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream",
                !filters.size
                  ? "border-stream bg-stream/10 text-stream"
                  : "border-border text-muted-foreground hover:border-stream/50"
              )}
            >
              All
              {!filters.size && (
                <span className="current-underline current-underline--animate" />
              )}
            </Link>
            {availableSizes.map((size) => {
              const active = filters.size === size;
              return (
                <Link
                  key={size}
                  href={buildCatalogHref(basePath, filters, { size })}
                  onClick={onNavigate}
                  className={cn(
                    "relative rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream",
                    active
                      ? "border-stream bg-stream/10 text-stream"
                      : "border-border text-muted-foreground hover:border-stream/50 hover:text-current"
                  )}
                >
                  {size}
                  {active && (
                    <span className="current-underline current-underline--animate" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <Label className="text-sm font-medium">Price range (USD)</Label>
        <form
          action={basePath}
          method="get"
          className={cn(
            isSidebar
              ? "flex flex-col gap-3"
              : "flex flex-wrap items-end gap-2"
          )}
          onSubmit={onNavigate}
        >
          {filters.q && (
            <input type="hidden" name="q" value={filters.q} />
          )}
          {filters.size && (
            <input type="hidden" name="size" value={filters.size} />
          )}
          {filters.sort && (
            <input type="hidden" name="sort" value={filters.sort} />
          )}
          <div className="space-y-1">
            <Label
              htmlFor={`${idPrefix}-minPrice`}
              className="text-xs text-muted-foreground"
            >
              Min
            </Label>
            <Input
              id={`${idPrefix}-minPrice`}
              name="minPrice"
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              defaultValue={filters.minPrice ?? ""}
              className={cn("tabular-price", isSidebar ? "w-full" : "w-24")}
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor={`${idPrefix}-maxPrice`}
              className="text-xs text-muted-foreground"
            >
              Max
            </Label>
            <Input
              id={`${idPrefix}-maxPrice`}
              name="maxPrice"
              type="number"
              min={0}
              step="0.01"
              placeholder="Any"
              defaultValue={filters.maxPrice ?? ""}
              className={cn("tabular-price", isSidebar ? "w-full" : "w-24")}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            className={cn(isSidebar && "w-full")}
          >
            Apply
          </Button>
        </form>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor={`${idPrefix}-sort`} className="text-sm font-medium">
          Sort
        </Label>
        <select
          id={`${idPrefix}-sort`}
          value={filters.sort ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            const href = buildCatalogHref(
              basePath,
              filters,
              value
                ? { sort: value as SearchParams["sort"] }
                : { clear: ["sort"] }
            );
            window.location.href = href;
            onNavigate?.();
          }}
          className="h-10 w-full rounded-md border border-input bg-mist px-3 text-sm text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value || "newest"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function ProductFilters({
  basePath,
  filters,
  availableSizes,
  ignoreCategoryInCount,
}: ProductFiltersProps) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters, {
    ignoreCategory: ignoreCategoryInCount,
  });
  const clearHref = catalogClearAllHref(basePath, filters);

  return (
    <>
      <aside className="hidden md:sticky md:top-6 md:block md:w-[260px] md:shrink-0 md:self-start">
        <div className="rounded-lg border border-border bg-mist p-5 dark:bg-current/5">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold tracking-tight text-current">
                Filters
              </h2>
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-stream px-1.5 text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </div>
            {activeCount > 0 && (
              <Link
                href={clearHref}
                className="shrink-0 text-xs text-stream underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
              >
                Clear all
              </Link>
            )}
          </div>
          <FilterFields
            basePath={basePath}
            filters={filters}
            availableSizes={availableSizes}
            layout="sidebar"
            idPrefix="desktop"
          />
        </div>
      </aside>

      <div className="mb-4 flex items-center justify-between md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-stream px-1.5 text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <SheetBody>
              <FilterFields
                basePath={basePath}
                filters={filters}
                availableSizes={availableSizes}
                onNavigate={() => setOpen(false)}
                layout="compact"
                idPrefix="mobile"
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
        {activeCount > 0 && (
          <Link
            href={clearHref}
            className="text-sm text-stream underline-offset-4 hover:underline"
          >
            Clear all
          </Link>
        )}
      </div>
    </>
  );
}
