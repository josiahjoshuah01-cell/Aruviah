"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/admin-auth";
import {
  markOrderManuallyFulfilled,
  updateOrderStatusAdmin,
} from "@/lib/admin-queries";
import {
  ADMIN_UPDATABLE_STATUSES,
  type OrderStatus,
} from "@/lib/order-status";

export async function updateOrderStatusAction(
  orderId: string,
  status: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdminUser();

  if (!ADMIN_UPDATABLE_STATUSES.includes(status as OrderStatus)) {
    return { ok: false, error: "Invalid status" };
  }

  const result = await updateOrderStatusAdmin(orderId, status as OrderStatus);
  if (result.ok) {
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/fulfillment");
    revalidatePath("/admin");
  }
  return result;
}

export async function markManuallyFulfilledAction(
  orderId: string,
  trackingNumber?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdminUser();

  const result = await markOrderManuallyFulfilled(orderId, trackingNumber);
  if (result.ok) {
    revalidatePath("/admin/fulfillment");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
  }
  return result;
}
