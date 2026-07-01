export type StagedVariantJson = {
  cj_variant_id: string;
  color: string | null;
  size: string | null;
  price_usd: number;
  cost_price_usd: number;
  shipping_cost_usd: number;
  stock: number;
  image_url: string | null;
  ships_from_country: string | null;
  is_fast_shipping: boolean;
};

export type StagedProduct = {
  id: string;
  cj_product_id: string;
  title: string;
  description: string | null;
  cost_price_usd: number;
  suggested_price_usd: number;
  image_url: string | null;
  suggested_category_id: string | null;
  variants: StagedVariantJson[];
  status: "pending" | "approved" | "rejected";
  search_keyword: string | null;
  rejection_reason: string | null;
  created_at: string;
  ships_from_country: string | null;
  is_fast_shipping: boolean;
};
export function parseStagedVariants(raw: unknown): StagedVariantJson[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (v): v is StagedVariantJson =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as StagedVariantJson).cj_variant_id === "string"
    )
    .map((v) => ({
      ...v,
      ships_from_country: v.ships_from_country ?? null,
      is_fast_shipping: v.is_fast_shipping ?? false,
    }));
}