import { createServiceClient } from "@/lib/supabase/admin";
import {
  refreshLiveCjStock,
  type CjStockRefreshResult,
} from "@/lib/cj-stock";

export type AdminProductVariantRow = {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  price_usd: number;
  stock: number;
  cj_variant_id: string | null;
  is_active: boolean;
  can_hard_delete: boolean;
};

export type AdminProductRow = {
  id: string;
  title: string;
  sku: string;
  category_name: string | null;
  variant_count: number;
  sold_count: number;
  is_active: boolean;
  can_hard_delete: boolean;
  has_cj_mapping: boolean;
  variants: AdminProductVariantRow[];
};

async function variantIdsWithOrderHistory(
  variantIds: string[]
): Promise<Set<string>> {
  if (variantIds.length === 0) return new Set();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("variant_id")
    .in("variant_id", variantIds);

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.variant_id));
}

export async function listAdminProducts(): Promise<AdminProductRow[]> {
  const supabase = createServiceClient();

  const [{ data: products, error }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        `
        id,
        title,
        sold_count,
        is_active,
        category_id,
        variants:product_variants(
          id,
          sku,
          color,
          size,
          price_usd,
          stock,
          cj_variant_id,
          is_active
        )
      `
      )
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name"),
  ]);

  if (error) throw error;

  const categoryMap = new Map(
    (categories ?? []).map((c) => [c.id, c.name] as const)
  );

  const allVariantIds = (products ?? []).flatMap(
    (p) => (p.variants ?? []).map((v) => v.id)
  );
  const withOrders = await variantIdsWithOrderHistory(allVariantIds);

  return (products ?? []).map((p) => {
    const variants = (p.variants ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      price_usd: Number(v.price_usd),
      stock: v.stock,
      cj_variant_id: v.cj_variant_id,
      is_active: v.is_active,
      can_hard_delete: !withOrders.has(v.id),
    }));

    const can_hard_delete =
      variants.length > 0 && variants.every((v) => v.can_hard_delete);
    const has_cj_mapping = variants.some((v) => !!v.cj_variant_id);

    return {
      id: p.id,
      title: p.title,
      sku: variants[0]?.sku ?? "—",
      category_name: p.category_id
        ? (categoryMap.get(p.category_id) ?? null)
        : null,
      variant_count: variants.length,
      sold_count: p.sold_count,
      is_active: p.is_active,
      can_hard_delete,
      has_cj_mapping,
      variants,
    };
  });
}

export async function hardDeleteProduct(
  productId: string
): Promise<{ ok: true } | { ok: false; error: string; requiresDeactivate?: true }> {
  const supabase = createServiceClient();

  const { data: variants, error: vErr } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);

  if (vErr) return { ok: false, error: vErr.message };

  const variantIds = (variants ?? []).map((v) => v.id);
  const withOrders = await variantIdsWithOrderHistory(variantIds);

  if (withOrders.size > 0) {
    return {
      ok: false,
      requiresDeactivate: true,
      error:
        "This product has order history and can't be deleted, only deactivated, to preserve past order records.",
    };
  }

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function hardDeleteVariant(
  variantId: string
): Promise<{ ok: true } | { ok: false; error: string; requiresDeactivate?: true }> {
  const supabase = createServiceClient();

  const { data: variant, error: fetchErr } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .eq("id", variantId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!variant) return { ok: false, error: "Variant not found" };

  const withOrders = await variantIdsWithOrderHistory([variantId]);
  if (withOrders.size > 0) {
    return {
      ok: false,
      requiresDeactivate: true,
      error:
        "This variant has order history and can't be deleted, only deactivated, to preserve past order records.",
    };
  }

  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variantId);

  if (error) return { ok: false, error: error.message };

  const { count } = await supabase
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("product_id", variant.product_id);

  if (count === 0) {
    await supabase.from("products").delete().eq("id", variant.product_id);
  }

  return { ok: true };
}

export async function setProductActive(
  productId: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  if (!isActive) {
    await supabase
      .from("product_variants")
      .update({ is_active: false })
      .eq("product_id", productId);
  }

  return { ok: true };
}

export async function setVariantActive(
  variantId: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("product_variants")
    .update({ is_active: isActive })
    .eq("id", variantId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function refreshProductCjStock(
  productId: string
): Promise<
  | { ok: true; results: CjStockRefreshResult[] }
  | { ok: false; error: string }
> {
  const supabase = createServiceClient();
  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("id, sku, cj_variant_id")
    .eq("product_id", productId)
    .not("cj_variant_id", "is", null);

  if (error) return { ok: false, error: error.message };
  if (!variants?.length) {
    return { ok: false, error: "No CJ-mapped variants on this product" };
  }

  const results = await refreshLiveCjStock(
    variants.map((v) => ({
      id: v.id,
      cj_variant_id: v.cj_variant_id as string,
      sku: v.sku,
    }))
  );
  return { ok: true, results };
}

export async function refreshAllActiveCjStock(): Promise<
  | { ok: true; results: CjStockRefreshResult[]; productCount: number }
  | { ok: false; error: string }
> {
  const supabase = createServiceClient();
  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("id, sku, cj_variant_id, product_id, product:products!inner(is_active)")
    .not("cj_variant_id", "is", null)
    .eq("is_active", true)
    .eq("product.is_active", true);

  if (error) return { ok: false, error: error.message };
  if (!variants?.length) {
    return { ok: true, results: [], productCount: 0 };
  }

  const productIds = new Set(variants.map((v) => v.product_id));

  const results = await refreshLiveCjStock(
    variants.map((v) => ({
      id: v.id,
      cj_variant_id: v.cj_variant_id as string,
      sku: v.sku,
    }))
  );

  return {
    ok: true,
    results,
    productCount: productIds.size,
  };
}
