"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/admin-auth";
import { runCjSearch } from "@/lib/cj-search";
import { runCjLookup } from "@/lib/cj-lookup";

export async function lookupCjProduct(identifier: string, categorySlug: string) {
  await assertAdminUser();

  const result = await runCjLookup(identifier, categorySlug);
  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  revalidatePath("/admin/staging");
  return {
    ok: true as const,
    title: result.row.title,
    variantCount: result.row.variants.length,
    lookupMethod: result.lookupMethod,
    shipsFromCountry: result.row.ships_from_country,
    isFastShipping: result.row.is_fast_shipping,
  };
}

export async function searchCjProducts(keyword: string, categorySlug: string) {
  await assertAdminUser();

  const result = await runCjSearch(keyword, categorySlug);
  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  revalidatePath("/admin/staging");
  return {
    ok: true as const,
    title: result.row.title,
    variantCount: result.row.variants.length,
    shipsFromCountry: result.row.ships_from_country,
    isFastShipping: result.row.is_fast_shipping,
  };
}
