import type { Metadata } from "next";
import { StagedReviewList } from "@/components/admin/staged-item-review";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  parseStagedVariants,
  type StagedProduct,
} from "@/lib/staging-types";

export const metadata: Metadata = {
  title: "Staging",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminStagingPage() {
  const supabase = createServiceClient();

  const [{ data: rows }, { data: categories }] = await Promise.all([
    supabase
      .from("staged_products")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("sort_order"),
  ]);

  const items: StagedProduct[] = (rows ?? []).map((row) => ({
    id: row.id,
    cj_product_id: row.cj_product_id,
    title: row.title,
    description: row.description,
    cost_price_usd: Number(row.cost_price_usd),
    suggested_price_usd: Number(row.suggested_price_usd),
    image_url: row.image_url,
    suggested_category_id: row.suggested_category_id,
    variants: parseStagedVariants(row.variants),
    status: row.status as StagedProduct["status"],
    search_keyword: row.search_keyword,
    rejection_reason: row.rejection_reason,
    created_at: row.created_at,
    ships_from_country: row.ships_from_country ?? null,
    is_fast_shipping: row.is_fast_shipping ?? false,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">CJ staging review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preview real catalog components before publishing to the live store.
        </p>
      </header>
      <StagedReviewList items={items} categories={categories ?? []} />
    </div>
  );
}
