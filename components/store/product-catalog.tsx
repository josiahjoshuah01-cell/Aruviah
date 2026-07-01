import { ProductGrid } from "@/components/store/product-grid";
import { ProductFilters } from "@/components/store/product-filters";
import { getDistinctSizes, getProducts } from "@/lib/queries";
import { parseSearchParams } from "@/lib/validations";
import type { CatalogFilters } from "@/lib/types";

type ProductCatalogProps = {
  searchParams: Record<string, string | string[] | undefined>;
  categorySlug?: string;
  basePath: string;
};

export async function ProductCatalog({
  searchParams,
  categorySlug,
  basePath,
}: ProductCatalogProps) {
  const filters = parseSearchParams(searchParams, categorySlug);

  const catalogFilters: CatalogFilters = {
    categorySlug: filters.category,
    search: filters.q,
    size: filters.size,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sort: filters.sort,
  };

  const [products, availableSizes] = await Promise.all([
    getProducts(catalogFilters),
    getDistinctSizes(filters.category),
  ]);

  return (
    <>
      <ProductFilters
        basePath={basePath}
        filters={filters}
        availableSizes={availableSizes}
        ignoreCategoryInCount={!!categorySlug}
      />
      {products.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No products match your filters.
        </p>
      ) : (
        <ProductGrid products={products} />
      )}
    </>
  );
}
