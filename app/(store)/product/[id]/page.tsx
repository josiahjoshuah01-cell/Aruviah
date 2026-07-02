import { notFound } from "next/navigation";
import { VariantSelector } from "@/components/store/variant-selector";
import { ProductDescription } from "@/components/store/product-description";
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
    ships_from_country: v.ships_from_country,
    is_fast_shipping: v.is_fast_shipping,
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
        <ProductDescription content={product.description} />
      )}

      <ProductReviews productId={product.id} />
    </div>
  );
}
