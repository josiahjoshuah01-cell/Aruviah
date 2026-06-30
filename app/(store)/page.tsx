import { Suspense } from "react";
import { ProductGrid } from "@/components/store/product-grid";
import { TrendingStrip } from "@/components/store/trending-strip";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { getCategories, getProducts } from "@/lib/queries";
import { parseSearchParams } from "@/lib/validations";

export const revalidate = 60;

async function ProductSection({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseSearchParams(await searchParams);
  const products = await getProducts({
    search: params.q,
    categorySlug: params.category,
  });

  return <ProductGrid products={products} />;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, trending] = await Promise.all([
    getCategories(),
    getProducts({ trending: true, limit: 12 }),
  ]);

  const params = await searchParams;
  const parsed = parseSearchParams(params);
  const showTrending = !parsed.q && !parsed.category;

  return (
    <>
      {showTrending && <TrendingStrip products={trending} />}
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}
