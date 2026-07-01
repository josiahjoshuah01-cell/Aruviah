import { notFound } from "next/navigation";
import { VariantSelector } from "@/components/store/variant-selector";
import { ProductReviews } from "@/components/store/product-reviews";
import {
  getProductWithVariants,
} from "@/lib/queries";
import type { Metadata } from "next";
import type { SerializableVariant } from "@/lib/variant-utils";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductWithVariants(id);
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
  const product = await getProductWithVariants(id);

  if (!product) notFound();

  const variants: SerializableVariant[] = product.variants.map((v) => ({
    id: v.id,
    color: v.color,
    size: v.size,
    price_usd: v.price_usd,
    shipping_cost_usd: v.shipping_cost_usd,
    stock: v.stock,
    image_url: v.image_url,
  }));

  return (
    <div>
      <VariantSelector
        productId={product.id}
        productTitle={product.title}
        coverImage={product.image_url}
        soldCount={product.sold_count}
        variants={variants}
      />

      {product.description && (
        <div className="mt-8 border-t border-border pt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">
            Description
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {product.description}
          </p>
        </div>
      )}

      <ProductReviews productId={product.id} />
    </div>
  );
}
