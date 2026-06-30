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
import { useCartStore } from "@/lib/cart-store";
import { formatPrice } from "@/lib/utils";

export function CartDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const items = useCartStore((s) => s.items);
  const totalPrice = useCartStore((s) => s.totalPrice());
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

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
            {items.map((item) => (
              <CartLineItem
                key={item.productId}
                item={item}
                onUpdateQty={updateQty}
                onRemove={removeItem}
              />
            ))}
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">Total</span>
              <span className="tabular-price text-lg font-semibold">
                {formatPrice(totalPrice)}
              </span>
            </div>
            <Button asChild className="w-full">
              <Link href="/checkout" onClick={() => setOpen(false)}>
                Checkout
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CartLineItem({
  item,
  onUpdateQty,
  onRemove,
}: {
  item: { productId: string; title: string; price: number; qty: number; image: string | null };
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const [optimisticQty, setOptimisticQty] = useOptimistic(
    item.qty,
    (_current, newQty: number) => newQty
  );
  const [, startTransition] = useTransition();

  function handleQtyChange(delta: number) {
    const newQty = optimisticQty + delta;
    if (newQty < 1) {
      onRemove(item.productId);
      return;
    }
    startTransition(() => {
      setOptimisticQty(newQty);
      onUpdateQty(item.productId, newQty);
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
        <p className="tabular-price text-sm font-medium">
          {formatPrice(item.price)}
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
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
            aria-label="Increase quantity"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={() => onRemove(item.productId)}
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
