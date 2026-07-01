import { Suspense } from "react";
import { ProductCatalog } from "@/components/store/product-catalog";
import { TrendingStrip } from "@/components/store/trending-strip";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { getProducts } from "@/lib/queries";
import { parseSearchParams } from "@/lib/validations";

export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const parsed = parseSearchParams(resolvedParams);
  const showTrending =
    !parsed.q &&
    !parsed.category &&
    !parsed.size &&
    parsed.minPrice == null &&
    parsed.maxPrice == null &&
    !parsed.sort;

  const trending = showTrending
    ? await getProducts({ trending: true, limit: 12 })
    : [];

  return (
    <>
      {showTrending && trending.length > 0 && (
        <TrendingStrip products={trending} />
      )}
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductCatalog
          searchParams={resolvedParams}
          basePath="/"
        />
      </Suspense>
    </>
  );
}
