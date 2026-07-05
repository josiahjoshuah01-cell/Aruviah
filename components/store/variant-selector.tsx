"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/cart-store";
import { cn, formatPrice } from "@/lib/utils";
import {
  isRealColorName,
  resolveColorSwatchFill,
  type SerializableVariant,
} from "@/lib/variant-utils";
import { formatEstimatedDelivery } from "@/lib/cj-shipping-origin";

type VariantSelectorProps = {
  productId: string;
  productTitle: string;
  coverImage: string | null;
  soldCount: number;
  variants: SerializableVariant[];
  preview?: boolean;
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

function variantForColorLabel(
  variants: SerializableVariant[],
  label: string
): SerializableVariant | undefined {
  return variants.find((v) => v.color === label);
}

export function VariantSelector({
  productId,
  productTitle,
  coverImage,
  soldCount,
  variants,
  preview = false,
}: VariantSelectorProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [pulsing, setPulsing] = useState(false);

  const colorLabels = uniqueValues(variants.map((v) => v.color));
  const realColorLabels = colorLabels.filter(isRealColorName);
  const imageVariantLabels = colorLabels.filter((c) => !isRealColorName(c));
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

  const deliveryLine = selectedVariant
    ? formatEstimatedDelivery(selectedVariant.ships_from_country ?? null)
    : null;

  const variantSectionTitle =
    realColorLabels.length > 0 ? "Color" : "Variant";

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
    <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-8">
      <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-xl bg-muted sm:max-w-sm md:max-w-[22rem]">
        {displayImage ? (
          <Image
            src={displayImage}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 352px"
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
                Estimated shipping: ~{formatPrice(selectedVariant.shipping_cost_usd)}
                {" — "}
                final cost calculated at checkout based on your address
              </p>
            )}
            {deliveryLine && (
              <p className="text-sm text-muted-foreground">
                {deliveryLine}
                {selectedVariant.is_fast_shipping && (
                  <span className="ml-2 inline-flex rounded bg-stream/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stream">
                    Fast
                  </span>
                )}
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

        {realColorLabels.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Color
              {selectedColor && isRealColorName(selectedColor) && (
                <span className="ml-1 font-normal text-muted-foreground">
                  — {selectedColor}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {realColorLabels.map((color) => {
                const isSelected = selectedColor === color;
                const fill = resolveColorSwatchFill(color);
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
                    {fill && (
                      <span
                        className="absolute inset-1 rounded-full border border-black/10 dark:border-white/15"
                        style={{ backgroundColor: fill }}
                      />
                    )}
                    {isSelected && (
                      <span className="current-underline current-underline--animate bottom-[-6px] h-0.5 w-[calc(100%+4px)] -translate-x-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {imageVariantLabels.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {variantSectionTitle}
              {selectedColor && imageVariantLabels.includes(selectedColor) && (
                <span className="ml-1 font-normal text-muted-foreground">
                  — {selectedColor}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-4">
              {imageVariantLabels.map((label) => {
                const isSelected = selectedColor === label;
                const variant = variantForColorLabel(variants, label);
                const thumbUrl =
                  variant?.image_url ?? coverImage ?? null;

                if (thumbUrl) {
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handleColorSelect(label)}
                      aria-label={`Variant ${label}`}
                      aria-pressed={isSelected}
                      className={cn(
                        "relative h-28 w-28 shrink-0 overflow-hidden rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream focus-visible:ring-offset-2 focus-visible:ring-offset-mist sm:h-32 sm:w-32",
                        isSelected
                          ? "border-stream ring-2 ring-stream/30"
                          : "border-border hover:border-stream/50"
                      )}
                    >
                      <Image
                        src={thumbUrl}
                        alt={label}
                        fill
                        sizes="128px"
                        className="object-cover"
                      />
                      {isSelected && (
                        <span className="current-underline current-underline--animate bottom-[-6px] h-0.5 w-[calc(100%+4px)] -translate-x-0.5" />
                      )}
                    </button>
                  );
                }

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleColorSelect(label)}
                    aria-label={`Variant ${label}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "relative rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream",
                      isSelected
                        ? "border-stream bg-stream/10 text-stream"
                        : "border-border text-muted-foreground hover:border-stream/50 hover:text-current"
                    )}
                  >
                    {label}
                    {isSelected && (
                      <span className="current-underline current-underline--animate" />
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
          {preview ? (
            <p className="text-center text-sm text-muted-foreground">
              Preview only — add to cart disabled
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
