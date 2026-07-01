import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import type { Category, Order, OrderItem, Product } from "@/lib/types";

function hasSupabaseEnv(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
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

export async function getProducts(options?: {
  categorySlug?: string;
  search?: string;
  limit?: number;
  trending?: boolean;
}): Promise<Product[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = createAnonClient();
  let query = supabase.from("products").select("*").eq("is_active", true);

  if (options?.categorySlug) {
    const category = await getCategoryBySlug(options.categorySlug);
    if (category) {
      query = query.eq("category_id", category.id);
    }
  }

  if (options?.search) {
    query = query.ilike("title", `%${options.search}%`);
  }

  if (options?.trending) {
    query = query.order("sold_count", { ascending: false }).limit(options.limit ?? 12);
  } else {
    query = query.order("created_at", { ascending: false });
    if (options?.limit) {
      query = query.limit(options.limit);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getProductById(id: string): Promise<Product | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error) return null;
  return data;
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
    .select("*, product:products(title, image_url)")
    .eq("order_id", orderId);

  if (error) throw error;
  return (data ?? []).map((item) => ({
    ...item,
    product: Array.isArray(item.product) ? item.product[0] : item.product,
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
