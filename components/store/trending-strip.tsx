"use client";

import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function TrendingStrip({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <section className="mb-8" aria-label="Trending now">
      <div className="mb-4 flex items-center gap-3 px-4 md:px-6">
        <div className="h-0.5 flex-1 bg-stream/30" />
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-stream">
          Trending now
        </h2>
        <div className="h-0.5 flex-1 bg-stream/30" />
      </div>
      <div
        className="scrollbar-hide flex gap-3 overflow-x-auto px-4 pb-2 md:px-6"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/product/${product.id}`}
            className="group relative w-36 shrink-0 scroll-ml-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream rounded-lg"
            style={{ scrollSnapAlign: "start" }}
          >
            <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
              {product.image_url && (
                <Image
                  src={product.image_url}
                  alt={product.title}
                  fill
                  sizes="144px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs leading-snug">
              {product.title}
            </p>
            <p className="tabular-price text-xs font-medium">
              {formatPrice(product.price_usd)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
