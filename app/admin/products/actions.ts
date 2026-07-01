"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/admin-auth";
import {
  hardDeleteProduct,
  hardDeleteVariant,
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
