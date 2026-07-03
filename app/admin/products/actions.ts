"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/admin-auth";
import {
  hardDeleteProduct,
  hardDeleteVariant,
  refreshAllActiveCjStock,
  refreshProductCjStock,
  setProductActive,
  setVariantActive,
} from "@/lib/admin-products";

function revalidateProductPaths() {
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function deleteProductAction(
  productId: string
): Promise<
  | { ok: true; action: "deleted" }
  | { ok: false; error: string; requiresDeactivate?: true }
> {
  await assertAdminUser();
  const result = await hardDeleteProduct(productId);
  if (result.ok) {
    revalidateProductPaths();
    return { ok: true, action: "deleted" };
  }
  return result;
}

export async function deleteVariantAction(
  variantId: string
): Promise<
  | { ok: true; action: "deleted" }
  | { ok: false; error: string; requiresDeactivate?: true }
> {
  await assertAdminUser();
  const result = await hardDeleteVariant(variantId);
  if (result.ok) {
    revalidateProductPaths();
    return { ok: true, action: "deleted" };
  }
  return result;
}

export async function setProductActiveAction(
  productId: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdminUser();
  const result = await setProductActive(productId, isActive);
  if (result.ok) revalidateProductPaths();
  return result;
}

export async function setVariantActiveAction(
  variantId: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdminUser();
  const result = await setVariantActive(variantId, isActive);
  if (result.ok) revalidateProductPaths();
  return result;
}

export async function refreshProductStockAction(
  productId: string
): Promise<
  | {
      ok: true;
      results: Array<{
        sku: string;
        before: number;
        after: number;
        updated: boolean;
        error?: string;
      }>;
    }
  | { ok: false; error: string }
> {
  await assertAdminUser();
  const result = await refreshProductCjStock(productId);
  if (!result.ok) return result;
  revalidateProductPaths();
  return {
    ok: true,
    results: result.results.map((r) => ({
      sku: r.sku,
      before: r.before,
      after: r.after,
      updated: r.updated,
      error: r.error,
    })),
  };
}

export async function refreshAllActiveCjStockAction(): Promise<
  | {
      ok: true;
      productCount: number;
      results: Array<{
        sku: string;
        before: number;
        after: number;
        updated: boolean;
        error?: string;
      }>;
    }
  | { ok: false; error: string }
> {
  await assertAdminUser();
  const result = await refreshAllActiveCjStock();
  if (!result.ok) return result;
  revalidateProductPaths();
  return {
    ok: true,
    productCount: result.productCount,
    results: result.results.map((r) => ({
      sku: r.sku,
      before: r.before,
      after: r.after,
      updated: r.updated,
      error: r.error,
    })),
  };
}
