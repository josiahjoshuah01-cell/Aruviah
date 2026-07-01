"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/cart-store";
import { cn, formatPrice } from "@/lib/utils";
import {
  colorSwatchFill,
  formatVariantLabel,
  type SerializableVariant,
} from "@/lib/variant-utils";

type VariantSelectorProps = {
  productId: string;
  productTitle: string;
  coverImage: string | null;
  soldCount: number;
  variants: SerializableVariant[];
};

function uniqueValues(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

function findVariant(
  variants: SerializableVariant[],
  color: string | null,
  size: string | null
): SerializableVariant | undefined {
  return variants.find((v) => {
    const colorMatch = color == null || v.color === color;
    const sizeMatch = size == null || v.size === size;
    return colorMatch && sizeMatch;
  });
}

export function VariantSelector({
  productId,
  productTitle,
  coverImage,
  soldCount,
  variants,
}: VariantSelectorProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [pulsing, setPulsing] = useState(false);

  const colors = uniqueValues(variants.map((v) => v.color));
  const sizes = uniqueValues(variants.map((v) => v.size));

  const initial = variants[0];
  const [selectedColor, setSelectedColor] = useState<string | null>(
    initial?.color ?? null
  );
  const [selectedSize, setSelectedSize] = useState<string | null>(
    initial?.size ?? null
  );

  const selectedVariant = useMemo(() => {
    const match = findVariant(variants, selectedColor, selectedSize);
    return match ?? variants[0];
  }, [variants, selectedColor, selectedSize]);

  const displayImage =
    selectedVariant?.image_url ?? coverImage ?? null;
  const lowStock =
    selectedVariant &&
    selectedVariant.stock > 0 &&
    selectedVariant.stock < 10;
  const outOfStock = !selectedVariant || selectedVariant.stock <= 0;

  function isSizeAvailable(size: string): boolean {
    return variants.some(
      (v) =>
        v.size === size &&
        (selectedColor == null || v.color === selectedColor) &&
        v.stock > 0
    );
  }

  function isSizeExisting(size: string): boolean {
    return variants.some(
      (v) =>
        v.size === size &&
        (selectedColor == null || v.color === selectedColor)
    );
  }

  function handleColorSelect(color: string) {
    setSelectedColor(color);
    if (selectedSize && !isSizeExisting(selectedSize)) {
      const fallback = variants.find(
        (v) => v.color === color && v.stock > 0
      );
      setSelectedSize(fallback?.size ?? null);
    }
  }

  function handleAdd() {
    if (!selectedVariant || selectedVariant.stock <= 0) {
      toast.error("This variant is out of stock");
      return;
    }
    addItem({
      variantId: selectedVariant.id,
      productId,
      title: productTitle,
      color: selectedVariant.color,
      size: selectedVariant.size,
      price: selectedVariant.price_usd,
      shippingCost: selectedVariant.shipping_cost_usd,
      image: displayImage,
    });
    setPulsing(true);
    toast.success("Added to cart");
    setTimeout(() => setPulsing(false), 600);
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        {displayImage ? (
          <Image
            src={displayImage}
            alt={productTitle}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No image available
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-bold md:text-3xl">
          {productTitle}
        </h1>

        {selectedVariant && (
          <>
            <p className="tabular-price text-2xl font-semibold">
              {formatPrice(selectedVariant.price_usd)}
            </p>
            {selectedVariant.shipping_cost_usd > 0 && (
              <p className="text-sm text-muted-foreground">
                + {formatPrice(selectedVariant.shipping_cost_usd)} shipping
              </p>
            )}
          </>
        )}

        {soldCount > 0 && (
          <p className="text-sm text-muted-foreground">
            · {soldCount >= 1000
              ? `${(soldCount / 1000).toFixed(1).replace(/\.0$/, "")}k sold`
              : `${soldCount} sold`}
          </p>
        )}

        {lowStock && selectedVariant && (
          <span className="inline-flex w-fit rounded bg-coral-pulse px-2 py-1 text-xs font-semibold uppercase text-white">
            Only {selectedVariant.stock} left
          </span>
        )}

        {colors.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Color
              {selectedColor && (
                <span className="ml-1 font-normal text-muted-foreground">
                  — {selectedColor}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {colors.map((color) => {
                const isSelected = selectedColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleColorSelect(color)}
                    aria-label={`Color ${color}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "relative h-9 w-9 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream focus-visible:ring-offset-2 focus-visible:ring-offset-mist",
                      isSelected
                        ? "border-stream ring-2 ring-stream/30"
                        : "border-border hover:border-stream/50"
                    )}
                  >
                    <span
                      className="absolute inset-1 rounded-full border border-black/10 dark:border-white/15"
                      style={{ backgroundColor: colorSwatchFill(color) }}
                    />
                    {isSelected && (
                      <span className="current-underline current-underline--animate bottom-[-6px] h-0.5 w-[calc(100%+4px)] -translate-x-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sizes.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Size</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((size) => {
                const exists = isSizeExisting(size);
                const available = isSizeAvailable(size);
                const isSelected = selectedSize === size;
                const disabled = !exists || !available;

                return (
                  <button
                    key={size}
                    type="button"
                    disabled={!exists}
                    title={
                      exists && !available
                        ? "Not available in this color"
                        : undefined
                    }
                    onClick={() => !disabled && setSelectedSize(size)}
                    aria-pressed={isSelected}
                    className={cn(
                      "relative rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream",
                      !exists && "cursor-not-allowed opacity-40",
                      exists && !available &&
                        "cursor-not-allowed opacity-50 line-through",
                      isSelected && exists && available
                        ? "border-stream bg-stream/10 text-stream"
                        : exists && available
                          ? "border-border text-muted-foreground hover:border-stream/50 hover:text-current"
                          : "border-border text-muted-foreground"
                    )}
                  >
                    {size}
                    {isSelected && exists && available && (
                      <span className="current-underline current-underline--animate" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative mt-2">
          <Button
            onClick={handleAdd}
            disabled={outOfStock}
            className="w-full"
            size="lg"
          >
            {outOfStock ? "Out of stock" : "Add to cart"}
          </Button>
          {pulsing && (
            <span className="current-underline current-underline--pulse" />
          )}
        </div>

        {selectedVariant && (
          <p className="text-xs text-muted-foreground">
            {formatVariantLabel(
              selectedVariant.color,
              selectedVariant.size
            ) ?? "Standard"}
          </p>
        )}
      </div>
    </div>
  );
}
