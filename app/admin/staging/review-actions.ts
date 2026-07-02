"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  parseStagedVariants,
  type StagedVariantJson,
} from "@/lib/staging-types";

async function nextArvSku(supabase: ReturnType<typeof createServiceClient>) {
  const { data: rows } = await supabase.from("product_variants").select("sku");
  const numbers = (rows ?? [])
    .map((r) => /^ARV-(\d+)$/.exec(r.sku)?.[1])
    .filter((n): n is string => !!n)
    .map((n) => parseInt(n, 10));
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 200;
  return `ARV-${String(next).padStart(5, "0")}`;
}

function scaleVariants(
  variants: StagedVariantJson[],
  originalSuggested: number,
  editedSuggested: number
): StagedVariantJson[] {
  if (variants.length === 0) return variants;
  const ratio =
    originalSuggested > 0 ? editedSuggested / originalSuggested : 1;
  return variants.map((v, index) => ({
    ...v,
    price_usd:
      index === 0
        ? Math.round(editedSuggested * 100) / 100
        : Math.round(v.price_usd * ratio * 100) / 100,
  }));
}

export async function approveStagedProduct(
  stagedId: string,
  suggestedPriceUsd: number,
  categoryId: string,
  description: string
) {
  await assertAdminUser();
  const supabase = createServiceClient();

  const { data: staged, error: fetchError } = await supabase
    .from("staged_products")
    .select("*")
    .eq("id", stagedId)
    .eq("status", "pending")
    .single();

  if (fetchError || !staged) {
    return { ok: false as const, error: "Staged product not found" };
  }

  const variants = parseStagedVariants(staged.variants);
  if (variants.length === 0) {
    return { ok: false as const, error: "No variants to commit" };
  }

  const trimmedDescription = description.trim();
  if (!trimmedDescription) {
    return { ok: false as const, error: "Description is required" };
  }

  const pricedVariants = scaleVariants(
    variants,
    Number(staged.suggested_price_usd),
    suggestedPriceUsd
  );

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      category_id: categoryId,
      title: staged.title,
      description: trimmedDescription,
      image_url: staged.image_url,
      cj_product_id: staged.cj_product_id,
      sold_count: 0,
      is_active: true,
    })
    .select("id")
    .single();

  if (productError || !product) {
    return {
      ok: false as const,
      error: productError?.message ?? "Product insert failed",
    };
  }

  let skuCounter = parseInt(
    (await nextArvSku(supabase)).replace("ARV-", ""),
    10
  );
  const variantRows = pricedVariants.map((v) => {
    const sku = `ARV-${String(skuCounter).padStart(5, "0")}`;
    skuCounter += 1;
    return {
      product_id: product.id,
      cj_variant_id: v.cj_variant_id,
      color: v.color,
      size: v.size,
      sku,
      price_usd: v.price_usd,
      shipping_cost_usd: v.shipping_cost_usd,
      stock: v.stock,
      image_url: v.image_url,
      is_active: true,
      ships_from_country: v.ships_from_country ?? null,
      is_fast_shipping: v.is_fast_shipping ?? false,
      is_verified_warehouse: v.is_verified_warehouse ?? null,
    };
  });

  const { error: variantError } = await supabase
    .from("product_variants")
    .insert(variantRows);

  if (variantError) {
    await supabase.from("products").delete().eq("id", product.id);
    return { ok: false as const, error: variantError.message };
  }

  const { error: updateError } = await supabase
    .from("staged_products")
    .update({ status: "approved" })
    .eq("id", stagedId);

  if (updateError) {
    return { ok: false as const, error: updateError.message };
  }

  revalidatePath("/admin/staging");
  return { ok: true as const };
}

export async function rejectStagedProduct(
  stagedId: string,
  rejectionReason?: string
) {
  await assertAdminUser();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("staged_products")
    .update({
      status: "rejected",
      rejection_reason: rejectionReason?.trim() || null,
    })
    .eq("id", stagedId)
    .eq("status", "pending");

  if (error) {
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/admin/staging");
  return { ok: true as const };
}
