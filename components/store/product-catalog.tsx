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
    <div className="md:grid md:grid-cols-[260px_minmax(0,1fr)] md:items-start md:gap-8">
      <ProductFilters
        basePath={basePath}
        filters={filters}
        availableSizes={availableSizes}
        ignoreCategoryInCount={!!categorySlug}
      />
      <div className="min-w-0">
        {products.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No products match your filters.
          </p>
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </div>
  );
}
