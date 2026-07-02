"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ProductCard } from "@/components/store/product-card";
import { VariantSelector } from "@/components/store/variant-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductDescription } from "@/components/store/product-description";
import type { Category, Product } from "@/lib/types";
import type { SerializableVariant } from "@/lib/variant-utils";
import {
  parseStagedVariants,
  type StagedProduct,
} from "@/lib/staging-types";
import {
  formatShipsFromLabel,
} from "@/lib/cj-shipping-origin";
import {
  approveStagedProduct,
  rejectStagedProduct,
} from "@/app/admin/staging/review-actions";
import {
  StagingCjReviewSignal,
  StagingVerifiedWarehouseBadges,
} from "@/components/admin/staging-quality-signals";

function toPreviewProduct(
  item: StagedProduct,
  priceUsd: number,
  categoryId: string | null,
  descriptionText: string
): Product {
  const variants = parseStagedVariants(item.variants);
  const first = variants[0];
  return {
    id: item.id,
    category_id: categoryId,
    title: item.title,
    description: descriptionText.trim() || item.description,
    image_url: item.image_url,
    sold_count: 0,
    is_active: true,
    created_at: item.created_at,
    price_usd: priceUsd,
    sku: "PREVIEW",
    stock: first?.stock ?? 0,
    shipping_cost_usd: first?.shipping_cost_usd ?? 0,
    default_variant_id: `preview-${item.id}-0`,
  };
}

function toPreviewVariants(item: StagedProduct): SerializableVariant[] {
  return parseStagedVariants(item.variants).map((v, index) => ({
    id: `preview-${item.id}-${index}`,
    color: v.color,
    size: v.size,
    price_usd: v.price_usd,
    shipping_cost_usd: v.shipping_cost_usd,
    stock: v.stock,
    image_url: v.image_url,
    ships_from_country: v.ships_from_country,
    is_fast_shipping: v.is_fast_shipping,
  }));
}

export function StagedItemReview({
  item,
  categories,
}: {
  item: StagedProduct;
  categories: Category[];
}) {
  const [hidden, setHidden] = useState(false);
  const [price, setPrice] = useState(String(item.suggested_price_usd));
  const [description, setDescription] = useState(item.description ?? "");
  const [categoryId, setCategoryId] = useState(
    item.suggested_category_id ?? categories[0]?.id ?? ""
  );
  const [rejectReason, setRejectReason] = useState("");
  const [isPending, startTransition] = useTransition();

  if (hidden) return null;

  const priceNum = parseFloat(price);
  const previewProduct = toPreviewProduct(
    item,
    Number.isFinite(priceNum) ? priceNum : item.suggested_price_usd,
    categoryId || null,
    description
  );
  const previewVariants = toPreviewVariants(item);
  const stagedVariants = parseStagedVariants(item.variants);
  const variantCountries = previewVariants.map((v) => v.ships_from_country ?? null);
  const shipsFromLabel = formatShipsFromLabel(
    item.ships_from_country,
    variantCountries
  );
  const showFastBadge = item.is_fast_shipping;
  const isMixedOrigins =
    [...new Set(variantCountries.filter(Boolean))].length > 1;

  function handleApprove() {
    if (!categoryId) {
      toast.error("Select a category");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error("Enter a valid price");
      return;
    }

    if (!description.trim()) {
      toast.error("Enter a description");
      return;
    }

    startTransition(async () => {
      setHidden(true);
      const result = await approveStagedProduct(
        item.id,
        priceNum,
        categoryId,
        description.trim()
      );
      if (!result.ok) {
        setHidden(false);
        toast.error(result.error);
        return;
      }
      toast.success("Approved and published");
    });
  }

  function handleReject() {
    startTransition(async () => {
      setHidden(true);
      const result = await rejectStagedProduct(item.id, rejectReason);
      if (!result.ok) {
        setHidden(false);
        toast.error(result.error);
        return;
      }
      toast.success("Rejected");
    });
  }

  return (
    <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Pending · CJ {item.cj_product_id}
          </p>
          {item.search_keyword && (
            <p className="text-xs text-muted-foreground">
              Search: {item.search_keyword}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Cost ${Number(item.cost_price_usd).toFixed(2)} ·{" "}
          {previewVariants.length} variant
          {previewVariants.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium">
          {shipsFromLabel}
        </span>
        {showFastBadge && !isMixedOrigins && (
          <span className="inline-flex items-center rounded-md bg-stream/15 px-2.5 py-1 text-xs font-semibold text-stream">
            Fast shipping
          </span>
        )}
        {isMixedOrigins && (
          <span className="inline-flex items-center rounded-md bg-coral-pulse/15 px-2.5 py-1 text-xs font-semibold text-coral-pulse">
            Mixed warehouse origins
          </span>
        )}
        <StagingVerifiedWarehouseBadges
          productVerified={item.is_verified_warehouse}
          variants={stagedVariants}
        />
      </div>

      <StagingCjReviewSignal
        count={item.cj_review_count}
        avgScore={item.cj_review_avg_score}
      />

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Catalog card preview
          </h2>
          <div className="max-w-xs">
            <ProductCard preview product={previewProduct} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Product page preview
          </h2>
          <VariantSelector
            preview
            productId={item.id}
            productTitle={item.title}
            coverImage={item.image_url}
            soldCount={0}
            variants={previewVariants}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-4 border-t border-border pt-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`price-${item.id}`}>Retail price (USD)</Label>
          <Input
            id={`price-${item.id}`}
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`category-${item.id}`}>Category</Label>
          <select
            id={`category-${item.id}`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`description-${item.id}`}>Description</Label>
          <textarea
            id={`description-${item.id}`}
            rows={12}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Description preview</Label>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <ProductDescription content={description} compact />
          </div>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`reject-${item.id}`}>
            Rejection reason (optional)
          </Label>
          <Input
            id={`reject-${item.id}`}
            placeholder="Why skip this item?"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={handleApprove} disabled={isPending}>
          Approve
        </Button>
        <Button
          variant="outline"
          onClick={handleReject}
          disabled={isPending}
        >
          Reject
        </Button>
      </div>
    </article>
  );
}

export function StagedReviewList({
  items,
  categories,
}: {
  items: StagedProduct[];
  categories: Category[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        No pending staged products. Use the search form above to stage items from
        CJ.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {items.map((item) => (
        <StagedItemReview key={item.id} item={item} categories={categories} />
      ))}
    </div>
  );
}
