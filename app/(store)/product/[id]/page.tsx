import Image from "next/image";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { getProductById } from "@/lib/queries";
import { formatPrice, formatSoldCount } from "@/lib/utils";
import type { Metadata } from "next";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) return { title: "Product not found" };
  return {
    title: product.title,
    description: product.description ?? `Buy ${product.title} on Aruviah`,
    openGraph: {
      title: product.title,
      images: product.image_url ? [{ url: product.image_url }] : [],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) notFound();

  const lowStock = product.stock > 0 && product.stock < 10;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.title}
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
          {product.title}
        </h1>
        <p className="tabular-price text-2xl font-semibold">
          {formatPrice(product.price_usd)}
        </p>
        {product.sold_count > 0 && (
          <p className="text-sm text-muted-foreground">
            · {formatSoldCount(product.sold_count)}
          </p>
        )}
        {lowStock && (
          <span className="inline-flex w-fit rounded bg-coral-pulse px-2 py-1 text-xs font-semibold uppercase text-white">
            Only {product.stock} left
          </span>
        )}
        {product.description && (
          <p className="text-muted-foreground leading-relaxed">
            {product.description}
          </p>
        )}
        <AddToCartButton product={product} />
      </div>
    </div>
  );
}
