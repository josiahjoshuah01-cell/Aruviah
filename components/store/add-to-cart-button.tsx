"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/cart-store";
import type { Product } from "@/lib/types";

export function AddToCartButton({ product }: { product: Product }) {
  const addItem = useCartStore((s) => s.addItem);
  const [pulsing, setPulsing] = useState(false);

  function handleAdd() {
    if (product.stock <= 0) {
      toast.error("Out of stock");
      return;
    }
    addItem({
      variantId: product.default_variant_id,
      productId: product.id,
      title: product.title,
      color: null,
      size: null,
      price: product.price_usd,
      shippingCost: product.shipping_cost_usd,
      image: product.image_url,
    });
    setPulsing(true);
    toast.success("Added to cart");
    setTimeout(() => setPulsing(false), 600);
  }

  return (
    <div className="relative">
      <Button
        onClick={handleAdd}
        disabled={product.stock <= 0}
        className="w-full"
        size="lg"
      >
        {product.stock <= 0 ? "Out of stock" : "Add to cart"}
      </Button>
      {pulsing && (
        <span className="current-underline current-underline--pulse" />
      )}
    </div>
  );
}
