import Image from "next/image";
import Link from "next/link";
import { formatPrice, formatSoldCount } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const lowStock = product.stock > 0 && product.stock < 10;

  return (
    <Link
      href={`/product/${product.id}`}
      className="group relative flex flex-col overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No image
          </div>
        )}
        {lowStock && (
          <span className="absolute left-2 top-2 rounded bg-coral-pulse px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {product.stock} left
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-0.5 px-0.5">
        <h3 className="line-clamp-2 text-sm leading-snug text-current">
          {product.title}
        </h3>
        <p className="tabular-price text-sm font-medium text-current">
          {formatPrice(product.price_usd)}
        </p>
        {product.sold_count > 0 && (
          <p className="text-xs text-muted-foreground">
            · {formatSoldCount(product.sold_count)}
          </p>
        )}
      </div>
    </Link>
  );
}
