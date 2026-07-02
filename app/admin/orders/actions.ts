"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/admin-auth";
import {
  getAdminOrderDetail,
  markOrderManuallyFulfilled,
  updateOrderStatusAdmin,
} from "@/lib/admin-queries";
import { canFileCjDispute } from "@/lib/cj-dispute-eligibility";
import {
  buildBusinessDisputeId,
  createDispute,
  getDisputeConfirmInfo,
  getDisputeEligibleProducts,
  type CjDisputeProduct,
  type CjDisputeProductInput,
} from "@/lib/cj-disputes";
import {
  insertDisputeRow,
  resolveNewestCjDisputeId,
  syncAllDisputesFromCjForOrder,
  syncDisputeFromCj,
} from "@/lib/dispute-queries";
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

async function assertDisputableOrder(orderId: string) {
  const order = await getAdminOrderDetail(orderId);
  if (!order) {
    return { ok: false as const, error: "Order not found" };
  }
  if (!canFileCjDispute(order)) {
    return {
      ok: false as const,
      error:
        "This order has no CJ API order id — disputes can only be filed for createOrderV2 orders.",
    };
  }
  return { ok: true as const, order };
}

export async function fetchDisputeEligibleProductsAction(orderId: string) {
  await assertAdminUser();
  const check = await assertDisputableOrder(orderId);
  if (!check.ok) return check;

  const result = await getDisputeEligibleProducts(check.order.cj_order_id!);
  if (!result.ok) return { ok: false as const, error: result.error };
  return { ok: true as const, data: result.data };
}

export async function fetchDisputeConfirmInfoAction(
  orderId: string,
  selectedLineItemIds: string[]
) {
  await assertAdminUser();
  const check = await assertDisputableOrder(orderId);
  if (!check.ok) return check;

  const productsResult = await getDisputeEligibleProducts(
    check.order.cj_order_id!
  );
  if (!productsResult.ok) {
    return { ok: false as const, error: productsResult.error };
  }

  const selected = new Set(selectedLineItemIds);
  const productInfoList: CjDisputeProductInput[] =
    productsResult.data.productInfoList
      .filter((p) => selected.has(p.lineItemId) && p.canChoose)
      .map((p) => ({
        lineItemId: p.lineItemId,
        quantity: p.quantity,
        price: p.price,
      }));

  if (!productInfoList.length) {
    return {
      ok: false as const,
      error: "Select at least one eligible line item",
    };
  }

  const result = await getDisputeConfirmInfo(
    check.order.cj_order_id!,
    productInfoList
  );
  if (!result.ok) return { ok: false as const, error: result.error };
  return { ok: true as const, data: result.data, productInfoList };
}

export async function createDisputeAction(input: {
  orderId: string;
  selectedLineItemIds: string[];
  disputeReasonId: number;
  expectType: 1 | 2;
  messageText: string;
  imageUrls?: string[];
}) {
  await assertAdminUser();
  const check = await assertDisputableOrder(input.orderId);
  if (!check.ok) return check;

  const confirm = await fetchDisputeConfirmInfoAction(
    input.orderId,
    input.selectedLineItemIds
  );
  if (!confirm.ok) return confirm;

  const reason = confirm.data.disputeReasonList.find(
    (r) => r.disputeReasonId === input.disputeReasonId
  );
  if (!reason) {
    return {
      ok: false as const,
      error: "Invalid dispute reason — refresh and pick from CJ's list",
    };
  }

  if (
    !confirm.data.expectResultOptionList.includes(String(input.expectType))
  ) {
    return {
      ok: false as const,
      error: `CJ does not allow expect type ${input.expectType} for this order`,
    };
  }

  const businessDisputeId = buildBusinessDisputeId(input.orderId);
  const createResult = await createDispute({
    cjOrderId: check.order.cj_order_id!,
    businessDisputeId,
    disputeReasonId: input.disputeReasonId,
    expectType: input.expectType,
    refundType: 1,
    messageText: input.messageText,
    imageUrl: input.imageUrls,
    productInfoList: confirm.productInfoList,
  });

  if (!createResult.ok) {
    return { ok: false as const, error: createResult.error };
  }

  const cjDisputeId = await resolveNewestCjDisputeId(check.order.cj_order_id!);
  const status = "Processing";

  const row = await insertDisputeRow({
    orderId: input.orderId,
    cjOrderId: check.order.cj_order_id!,
    cjDisputeId,
    status,
    reason: reason.reasonName,
    expectType: input.expectType,
    refundAmount: confirm.data.maxAmount,
  });

  if (cjDisputeId) {
    await syncDisputeFromCj(row.id, cjDisputeId);
  }

  revalidatePath(`/admin/orders/${input.orderId}`);
  revalidatePath("/admin/orders");

  return {
    ok: true as const,
    disputeId: row.id,
    cjDisputeId,
    status: row.status,
  };
}

export async function refreshDisputesFromCjAction(orderId: string) {
  await assertAdminUser();
  const check = await assertDisputableOrder(orderId);
  if (!check.ok) return check;

  const result = await syncAllDisputesFromCjForOrder(
    orderId,
    check.order.cj_order_id!
  );
  if (!result.ok) return { ok: false as const, error: result.error };

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true as const, synced: result.synced };
}

export async function refreshDisputeDetailAction(
  orderId: string,
  localDisputeId: string,
  cjDisputeId: string
) {
  await assertAdminUser();
  const check = await assertDisputableOrder(orderId);
  if (!check.ok) return check;

  const result = await syncDisputeFromCj(localDisputeId, cjDisputeId);
  if (!result.ok) return { ok: false as const, error: result.error };

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true as const, detail: result.detail };
}

export type { CjDisputeProduct };
