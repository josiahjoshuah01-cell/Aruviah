"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteProductAction,
  deleteVariantAction,
  refreshAllActiveCjStockAction,
  refreshProductStockAction,
  setProductActiveAction,
  setVariantActiveAction,
} from "@/app/admin/products/actions";
import type { AdminProductRow } from "@/lib/admin-products";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variant-utils";
import { cn } from "@/lib/utils";

function ConfirmDelete({
  label,
  onConfirm,
  onCancel,
  pending,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-coral-pulse/30 bg-coral-pulse/5 px-2 py-1.5 text-xs">
      <span>
        Delete {label}? This cannot be undone.
      </span>
      <Button size="sm" variant="destructive" onClick={onConfirm} disabled={pending}>
        {pending ? "Deleting…" : "Confirm"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}

function VariantRow({
  variant,
}: {
  variant: AdminProductRow["variants"][number];
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = formatVariantLabel(variant.color, variant.size) ?? variant.sku;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteVariantAction(variant.id);
      if (!result.ok) {
        toast.error(result.error);
        setConfirmDelete(false);
        return;
      }
      toast.success("Variant deleted");
      setConfirmDelete(false);
      router.refresh();
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await setVariantActiveAction(variant.id, !variant.is_active);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(variant.is_active ? "Variant deactivated" : "Variant activated");
      router.refresh();
    });
  }

  return (
    <tr className="bg-muted/20 text-sm">
      <td className="px-4 py-2 pl-10 font-mono text-xs">{variant.sku}</td>
      <td className="px-4 py-2 text-muted-foreground">{label}</td>
      <td className="px-4 py-2 tabular-price">{formatPrice(variant.price_usd)}</td>
      <td className="px-4 py-2">{variant.stock}</td>
      <td className="px-4 py-2">
        <span
          className={cn(
            "text-xs",
            variant.is_active ? "text-stream" : "text-muted-foreground"
          )}
        >
          {variant.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-2">
        {confirmDelete ? (
          <ConfirmDelete
            label={label}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
            pending={pending}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {variant.can_hard_delete ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-coral-pulse hover:text-coral-pulse"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                Delete
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleToggleActive}
                disabled={pending}
              >
                {variant.is_active ? "Deactivate" : "Activate"}
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function formatStockRefreshToast(
  results: Array<{
    sku: string;
    before: number;
    after: number;
    updated: boolean;
    error?: string;
  }>
): string {
  const changed = results.filter((r) => r.updated);
  if (changed.length === 0) {
    const first = results[0];
    if (first && !first.error) {
      return `${first.sku}: ${first.before} → ${first.after} (already in sync)`;
    }
    return "Stock already matches CJ";
  }
  if (changed.length === 1) {
    const r = changed[0];
    return `${r.sku}: ${r.before} → ${r.after}`;
  }
  return `Updated ${changed.length} variant(s) from CJ`;
}

function ProductRow({ product }: { product: AdminProductRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleRefreshStock() {
    startTransition(async () => {
      const result = await refreshProductStockAction(product.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const errors = result.results.filter((r) => r.error);
      if (errors.length > 0) {
        toast.error(errors.map((r) => `${r.sku}: ${r.error}`).join("; "));
      }
      toast.success(formatStockRefreshToast(result.results));
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProductAction(product.id);
      if (!result.ok) {
        toast.error(result.error);
        setConfirmDelete(false);
        return;
      }
      toast.success("Product deleted");
      setConfirmDelete(false);
      router.refresh();
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await setProductActiveAction(product.id, !product.is_active);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        product.is_active ? "Product deactivated" : "Product activated"
      );
      router.refresh();
    });
  }

  return (
    <>
      <tr className="hover:bg-muted/30">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream rounded"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <span className="font-medium">{product.title}</span>
          </button>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {product.category_name ?? "—"}
        </td>
        <td className="px-4 py-3">{product.variant_count}</td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "text-xs font-medium",
              product.is_active ? "text-stream" : "text-muted-foreground"
            )}
          >
            {product.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-4 py-3">{product.sold_count}</td>
        <td className="px-4 py-3">
          {confirmDelete ? (
            <ConfirmDelete
              label={product.title}
              onConfirm={handleDelete}
              onCancel={() => setConfirmDelete(false)}
              pending={pending}
            />
          ) : (
            <div className="flex flex-col gap-1">
              {product.has_cj_mapping && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleRefreshStock}
                  disabled={pending}
                >
                  {pending ? "Refreshing…" : "Refresh stock from CJ"}
                </Button>
              )}
              {product.can_hard_delete ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-coral-pulse hover:text-coral-pulse"
                  onClick={() => setConfirmDelete(true)}
                  disabled={pending}
                >
                  Delete
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={handleToggleActive}
                    disabled={pending}
                  >
                    {product.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <p className="max-w-[200px] text-[10px] leading-snug text-muted-foreground">
                    Has order history — deactivate only
                  </p>
                </>
              )}
            </div>
          )}
        </td>
      </tr>
      {open &&
        product.variants.map((v) => (
          <VariantRow key={v.id} variant={v} />
        ))}
    </>
  );
}

export function AdminProductsTable({ products }: { products: AdminProductRow[] }) {
  const router = useRouter();
  const [bulkPending, startBulkTransition] = useTransition();
  const cjProductCount = products.filter((p) => p.has_cj_mapping && p.is_active)
    .length;

  function handleRefreshAll() {
    startBulkTransition(async () => {
      const result = await refreshAllActiveCjStockAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const changed = result.results.filter((r) => r.updated);
      toast.success(
        changed.length > 0
          ? `Refreshed ${changed.length} variant(s) across ${result.productCount} active CJ product(s)`
          : `Checked ${result.results.length} variant(s) — all already in sync with CJ`
      );
      router.refresh();
    });
  }

  if (products.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No products in the catalog.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {cjProductCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Sync local stock with CJ live inventory ({cjProductCount} active CJ
            product{cjProductCount === 1 ? "" : "s"}).
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={bulkPending}
          >
            {bulkPending ? "Refreshing all…" : "Refresh all active CJ products"}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Variants</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Sold</th>
            <th className="px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
