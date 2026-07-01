"use client";

import { useState, useOptimistic, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  useCartStore,
  selectCartSubtotal,
  selectCartShipping,
  selectCartTotalPrice,
} from "@/lib/cart-store";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variant-utils";
import { useVariantAvailability } from "@/hooks/use-variant-availability";

export function CartDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const shipping = useCartStore(selectCartShipping);
  const total = useCartStore(selectCartTotalPrice);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

  const variantIds = items.map((i) => i.variantId);
  const { loaded, availability } = useVariantAvailability(variantIds, open);

  const hasUnavailable =
    loaded &&
    items.some((item) => !availability.get(item.variantId)?.available);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Your cart</SheetTitle>
        </SheetHeader>
        {items.length === 0 ? (
          <p className="mt-8 text-center text-muted-foreground">
            Your cart is empty
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {items.map((item, index) => {
              const entry = availability.get(item.variantId);
              const unavailable =
                loaded && entry !== undefined && !entry.available;
              const lineKey =
                item.variantId ||
                `${item.productId}-${item.color ?? ""}-${item.size ?? ""}-${index}`;
              return (
                <CartLineItem
                  key={lineKey}
                  item={item}
                  unavailable={unavailable}
                  onUpdateQty={updateQty}
                  onRemove={removeItem}
                />
              );
            })}
            <Separator />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-price">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="tabular-price">
                  {shipping > 0 ? formatPrice(shipping) : "—"}
                </span>
              </div>
              <div className="flex justify-between pt-1 font-medium">
                <span>Total</span>
                <span className="tabular-price text-lg">
                  {formatPrice(total)}
                </span>
              </div>
            </div>
            <Button asChild className="w-full" disabled={hasUnavailable}>
              <Link href="/checkout" onClick={() => setOpen(false)}>
                Checkout
              </Link>
            </Button>
            {hasUnavailable && (
              <p className="text-center text-xs text-coral-pulse">
                Remove unavailable items to continue
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CartLineItem({
  item,
  unavailable,
  onUpdateQty,
  onRemove,
}: {
  item: {
    variantId: string;
    title: string;
    color: string | null;
    size: string | null;
    price: number;
    shippingCost: number;
    qty: number;
    image: string | null;
  };
  unavailable: boolean;
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const [optimisticQty, setOptimisticQty] = useOptimistic(
    item.qty,
    (_current, newQty: number) => newQty
  );
  const [, startTransition] = useTransition();

  const variantLabel = formatVariantLabel(item.color, item.size);

  function handleQtyChange(delta: number) {
    const newQty = optimisticQty + delta;
    if (newQty < 1) {
      onRemove(item.variantId);
      return;
    }
    startTransition(() => {
      setOptimisticQty(newQty);
      onUpdateQty(item.variantId, newQty);
    });
  }

  return (
    <div className="flex gap-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {item.image && (
          <Image src={item.image} alt={item.title} fill className="object-cover" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <p className="line-clamp-2 text-sm">{item.title}</p>
        {variantLabel && (
          <p className="text-xs text-muted-foreground">{variantLabel}</p>
        )}
        {unavailable && (
          <p className="text-xs font-medium text-coral-pulse">
            This item is no longer available — remove to continue checkout
          </p>
        )}
        <p className="tabular-price text-sm font-medium">
          {formatPrice(item.price + item.shippingCost)}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleQtyChange(-1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
            aria-label="Decrease quantity"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="tabular-price w-6 text-center text-sm">{optimisticQty}</span>
          <button
            onClick={() => handleQtyChange(1)}
            disabled={unavailable}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream disabled:opacity-40"
            aria-label="Increase quantity"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={() => onRemove(item.variantId)}
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-coral-pulse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
            aria-label="Remove item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

