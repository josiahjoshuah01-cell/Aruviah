import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import type {
  CatalogFilters,
  Category,
  Order,
  OrderItem,
  Product,
  ProductVariant,
  ProductWithVariants,
  ReviewEligibility,
  ReviewSummary,
  ReviewWithAuthor,
} from "@/lib/types";

function hasSupabaseEnv(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

type ProductRow = {
  id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  sold_count: number;
  is_active: boolean;
  created_at: string;
  variants: Array<{
    id: string;
    sku: string;
    color: string | null;
    size: string | null;
    price_usd: number;
    shipping_cost_usd: number;
    stock: number;
    image_url: string | null;
    is_active: boolean;
    created_at: string;
  }>;
};

function mapProductRow(row: ProductRow): Product | null {
  const variants = (row.variants ?? [])
    .filter((v) => v.is_active)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  const variant = variants[0];
  if (!variant) return null;

  return {
    id: row.id,
    category_id: row.category_id,
    title: row.title,
    description: row.description,
    image_url: row.image_url ?? variant.image_url,
    sold_count: row.sold_count,
    is_active: row.is_active,
    created_at: row.created_at,
    price_usd: Number(variant.price_usd),
    sku: variant.sku,
    stock: variant.stock,
    shipping_cost_usd: Number(variant.shipping_cost_usd),
    default_variant_id: variant.id,
  };
}

const PRODUCT_SELECT = `
  id,
  category_id,
  title,
  description,
  image_url,
  sold_count,
  is_active,
  created_at,
  variants:product_variants!inner(
    id,
    sku,
    color,
    size,
    price_usd,
    shipping_cost_usd,
    stock,
    image_url,
    is_active,
    created_at
  )
`;

function mapVariantRow(
  v: ProductRow["variants"][number],
  productId: string
): ProductVariant {
  return {
    id: v.id,
    product_id: productId,
    cj_variant_id: null,
    color: v.color,
    size: v.size,
    sku: v.sku,
    price_usd: Number(v.price_usd),
    shipping_cost_usd: Number(v.shipping_cost_usd),
    stock: v.stock,
    image_url: v.image_url,
    is_active: v.is_active,
    created_at: v.created_at,
  };
}

function variantMatchesFilters(
  v: ProductRow["variants"][number],
  filters: CatalogFilters
): boolean {
  if (filters.size && v.size !== filters.size) return false;
  const price = Number(v.price_usd);
  if (filters.minPrice != null && price < filters.minPrice) return false;
  if (filters.maxPrice != null && price > filters.maxPrice) return false;
  return true;
}

function sortProductRows(rows: ProductRow[], sort?: CatalogFilters["sort"]): ProductRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "price-asc":
      sorted.sort((a, b) => {
        const aMin = Math.min(
          ...a.variants.map((v) => Number(v.price_usd))
        );
        const bMin = Math.min(
          ...b.variants.map((v) => Number(v.price_usd))
        );
        return aMin - bMin;
      });
      break;
    case "price-desc":
      sorted.sort((a, b) => {
        const aMax = Math.max(
          ...a.variants.map((v) => Number(v.price_usd))
        );
        const bMax = Math.max(
          ...b.variants.map((v) => Number(v.price_usd))
        );
        return bMax - aMax;
      });
      break;
    case "bestselling":
      sorted.sort((a, b) => b.sold_count - a.sold_count);
      break;
    case "newest":
    default:
      sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }
  return sorted;
}

export async function getCategories(): Promise<Category[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Categories that have at least one active product — for store nav rail. */
export async function getCategoriesForNav(): Promise<Category[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = createAnonClient();
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("category_id")
    .eq("is_active", true)
    .not("category_id", "is", null);

  if (productsError) throw productsError;

  const categoryIds = [
    ...new Set(
      (products ?? [])
        .map((p) => p.category_id)
        .filter((id): id is string => !!id)
    ),
  ];

  if (categoryIds.length === 0) return [];

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .in("id", categoryIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) return null;
  return data;
}

export async function getProducts(
  options?: CatalogFilters
): Promise<Product[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = createAnonClient();
  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("variants.is_active", true);

  if (options?.categorySlug) {
    const category = await getCategoryBySlug(options.categorySlug);
    if (category) {
      query = query.eq("category_id", category.id);
    }
  }

  if (options?.search) {
    query = query.ilike("title", `%${options.search}%`);
  }

  if (options?.size) {
    query = query.eq("variants.size", options.size);
  }

  if (options?.minPrice != null) {
    query = query.gte("variants.price_usd", options.minPrice);
  }

  if (options?.maxPrice != null) {
    query = query.lte("variants.price_usd", options.maxPrice);
  }

  if (options?.trending) {
    query = query.order("sold_count", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data as ProductRow[]).map((row) => ({
    ...row,
    variants: row.variants.filter((v) => variantMatchesFilters(v, options ?? {})),
  })).filter((row) => row.variants.length > 0);

  if (!options?.trending) {
    rows = sortProductRows(rows, options?.sort);
  }

  if (options?.limit) {
    rows = rows.slice(0, options.limit);
  }

  return rows
    .map(mapProductRow)
    .filter((p): p is Product => p !== null);
}

export async function getDistinctSizes(
  categorySlug?: string
): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = createAnonClient();
  let productQuery = supabase
    .from("products")
    .select("id")
    .eq("is_active", true);

  if (categorySlug) {
    const category = await getCategoryBySlug(categorySlug);
    if (category) {
      productQuery = productQuery.eq("category_id", category.id);
    }
  }

  const { data: products, error: productsError } = await productQuery;
  if (productsError || !products?.length) return [];

  const productIds = products.map((p) => p.id);

  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("size")
    .in("product_id", productIds)
    .eq("is_active", true)
    .not("size", "is", null);

  if (error) throw error;

  const sizes = [
    ...new Set(
      (variants ?? [])
        .map((v) => v.size)
        .filter((s): s is string => !!s)
    ),
  ];

  return sizes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function getProductById(id: string): Promise<Product | null> {
  const detail = await getProductWithVariants(id);
  if (!detail) return null;
  return (({ variants: _, ...product }) => product)(detail);
}

export async function getProductWithVariants(
  id: string
): Promise<ProductWithVariants | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .eq("is_active", true)
    .eq("variants.is_active", true)
    .single();

  if (error || !data) return null;

  const row = data as ProductRow;
  const product = mapProductRow(row);
  if (!product) return null;

  const variants = (row.variants ?? [])
    .filter((v) => v.is_active)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .map((v) => mapVariantRow(v, row.id));

  return { ...product, variants };
}

export async function getReviewSummary(
  productId: string
): Promise<ReviewSummary> {
  if (!hasSupabaseEnv()) {
    return { average_rating: 0, review_count: 0 };
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("product_id", productId);

  if (error || !data?.length) {
    return { average_rating: 0, review_count: 0 };
  }

  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  return {
    average_rating: Math.round((sum / data.length) * 10) / 10,
    review_count: data.length,
  };
}

export async function getProductReviews(
  productId: string,
  options?: { limit?: number; offset?: number }
): Promise<ReviewWithAuthor[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = createAnonClient();
  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;

  const { data, error } = await supabase
    .from("reviews")
    .select("id, product_id, user_id, order_id, rating, comment, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return (data ?? []).map((r) => ({
    ...r,
    author_name: "Verified Buyer",
  }));
}

/** Mirrors reviews INSERT RLS — used to drive review form UI state. */
export async function getReviewEligibility(
  productId: string
): Promise<ReviewEligibility> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  const { data: purchasedItems, error: purchaseError } = await supabase
    .from("order_items")
    .select(
      "order_id, orders!inner(user_id, status), product_variants!inner(product_id)"
    )
    .eq("orders.user_id", user.id)
    .in("orders.status", ["paid", "shipped"])
    .eq("product_variants.product_id", productId);

  if (purchaseError || !purchasedItems?.length) {
    return { status: "not_eligible" };
  }

  const eligibleOrderIds = [
    ...new Set(purchasedItems.map((item) => item.order_id)),
  ];

  const { data: existingReviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("order_id")
    .eq("product_id", productId)
    .eq("user_id", user.id)
    .in("order_id", eligibleOrderIds);

  if (reviewsError) {
    return { status: "not_eligible" };
  }

  const reviewedOrderIds = new Set(
    (existingReviews ?? []).map((r) => r.order_id)
  );

  const unreviewedOrderId = eligibleOrderIds.find(
    (id) => !reviewedOrderIds.has(id)
  );

  if (unreviewedOrderId) {
    return { status: "eligible", orderId: unreviewedOrderId };
  }

  return { status: "already_reviewed" };
}

export async function getOrderById(id: string): Promise<Order | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(
      "*, variant:product_variants(sku, image_url, product:products(title, image_url))"
    )
    .eq("order_id", orderId);

  if (error) throw error;
  return (data ?? []).map((item) => ({
    ...item,
    variant: Array.isArray(item.variant) ? item.variant[0] : item.variant,
  }));
}

export async function getUserOrders(): Promise<Order[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
