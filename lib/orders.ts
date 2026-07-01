import { createServiceClient } from "@/lib/supabase/admin";
import { createCJOrder, type CJOrderResult } from "@/lib/cj";
import { parseCjOrderAmountUsd, tryAutoPayCjOrder } from "@/lib/cj-payment";
import type { CartItemInput, ShippingAddress } from "@/lib/validations";

export type ResolvedCartItem = {
  variantId: string;
  productId: string;
  qty: number;
  price: number;
  shippingCost: number;
  sku: string;
  title: string;
  stock: number;
};

export async function getExistingOrderByPaypalId(
  paypalOrderId: string
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("paypal_order_id", paypalOrderId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolveCartItems(
  items: CartItemInput[]
): Promise<{ items: ResolvedCartItem[]; total: number } | { error: string }> {
  const supabase = createServiceClient();
  const variantIds = items.map((i) => i.variantId);

  const { data: variants, error } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, price_usd, shipping_cost_usd, stock, sku, is_active, product:products(id, title, is_active)"
    )
    .in("id", variantIds);

  if (error || !variants) {
    return { error: "Failed to fetch product variants" };
  }

  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const resolved: ResolvedCartItem[] = [];
  let total = 0;

  for (const item of items) {
    const variant = variantMap.get(item.variantId);
    const product = Array.isArray(variant?.product)
      ? variant.product[0]
      : variant?.product;

    if (!variant || !variant.is_active || !product?.is_active) {
      return { error: `Variant ${item.variantId} is unavailable` };
    }
    if (variant.stock < item.qty) {
      return { error: `"${product.title}" is out of stock` };
    }

    const price = Number(variant.price_usd);
    const shippingCost = Number(variant.shipping_cost_usd);
    total += (price + shippingCost) * item.qty;

    resolved.push({
      variantId: variant.id,
      productId: variant.product_id,
      qty: item.qty,
      price,
      shippingCost,
      sku: variant.sku,
      title: product.title,
      stock: variant.stock,
    });
  }

  return { items: resolved, total };
}

export async function savePendingCheckout(params: {
  paypalOrderId: string;
  userId: string;
  items: CartItemInput[];
  shippingCountry: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("paypal_checkout_pending").upsert(
    {
      paypal_order_id: params.paypalOrderId,
      user_id: params.userId,
      items: params.items,
      shipping_country: params.shippingCountry,
    },
    { onConflict: "paypal_order_id" }
  );
  if (error) {
    console.error("[pending-checkout] save failed:", error);
  }
}

export async function updatePendingShipping(
  paypalOrderId: string,
  shipping: ShippingAddress
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("paypal_checkout_pending")
    .update({ shipping })
    .eq("paypal_order_id", paypalOrderId);
}

export async function deletePendingCheckout(
  paypalOrderId: string
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("paypal_checkout_pending")
    .delete()
    .eq("paypal_order_id", paypalOrderId);
}

type PendingCheckout = {
  user_id: string;
  items: CartItemInput[];
  shipping: ShippingAddress | null;
  shipping_country: string;
};

async function getPendingCheckout(
  paypalOrderId: string
): Promise<PendingCheckout | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("paypal_checkout_pending")
    .select("user_id, items, shipping, shipping_country")
    .eq("paypal_order_id", paypalOrderId)
    .maybeSingle();

  if (!data) return null;
  return {
    user_id: data.user_id,
    items: data.items as CartItemInput[],
    shipping: data.shipping as ShippingAddress | null,
    shipping_country: data.shipping_country,
  };
}

/**
 * Branch on CJ createCJOrder result — shared by capture + webhook paths.
 */
export async function applyCJFulfillmentResult(
  orderId: string,
  cjResult: CJOrderResult,
  orderTotalUsd?: number
): Promise<void> {
  const supabase = createServiceClient();

  if ("skipped" in cjResult) {
    const note =
      cjResult.reason === "unmapped_sku"
        ? `Unmapped SKU(s): ${cjResult.unmappedSkus.join(", ")}`
        : "CJ credentials missing — fulfillment skipped.";
    await supabase
      .from("orders")
      .update({
        status: "paid_needs_manual_fulfillment",
        fulfillment_note: note,
        cj_payment_status: "not_required",
      })
      .eq("id", orderId);
    return;
  }

  if (cjResult.success) {
    const amountUsd =
      cjResult.orderAmountUsd > 0
        ? cjResult.orderAmountUsd
        : parseCjOrderAmountUsd(null, null, orderTotalUsd);

    await supabase
      .from("orders")
      .update({
        status: "paid",
        cj_order_id: cjResult.cjOrderId,
        cj_shipment_order_id: cjResult.shipmentOrderId,
        cj_pay_id: cjResult.payId,
        cj_order_amount_usd: amountUsd > 0 ? amountUsd : orderTotalUsd ?? null,
        cj_payment_status: "unpaid",
        fulfillment_note: null,
      })
      .eq("id", orderId);

    await tryAutoPayCjOrder(orderId);
    return;
  }

  console.error(`[CJ] Fulfillment error for order ${orderId}:`, cjResult.error);
  await supabase
    .from("orders")
    .update({
      status: "paid_fulfillment_pending",
      fulfillment_note: cjResult.error,
      cj_payment_status: "not_required",
    })
    .eq("id", orderId);
}

/**
 * Insert order + items + stock decrement (atomic via RPC), then CJ fulfillment.
 * Idempotent on paypal_order_id.
 */
export async function fulfillOrder(params: {
  paypalOrderId: string;
  userId: string;
  items: CartItemInput[];
  shipping: ShippingAddress;
}): Promise<{ orderId: string } | { error: string }> {
  const existingId = await getExistingOrderByPaypalId(params.paypalOrderId);
  if (existingId) {
    return { orderId: existingId };
  }

  const resolved = await resolveCartItems(params.items);
  if ("error" in resolved) {
    return { error: resolved.error };
  }

  const { items, total } = resolved;
  const supabase = createServiceClient();

  const rpcItems = items.map((item) => ({
    variant_id: item.variantId,
    qty: item.qty,
    price: item.price,
  }));

  const { data: orderId, error: rpcError } = await supabase.rpc(
    "fulfill_paid_order",
    {
      p_user_id: params.userId,
      p_paypal_order_id: params.paypalOrderId,
      p_total: total,
      p_shipping: params.shipping,
      p_items: rpcItems,
    }
  );

  if (rpcError || !orderId) {
    const dup = await getExistingOrderByPaypalId(params.paypalOrderId);
    if (dup) return { orderId: dup };
    console.error("[fulfillOrder] RPC failed:", rpcError);
    return { error: "Failed to create order" };
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(
    params.userId
  );

  const cjResult = await createCJOrder({
    orderId: orderId as string,
    shipping: params.shipping,
    email: authUser?.user?.email,
    items: items.map((i) => ({
      variantId: i.variantId,
      sku: i.sku,
      qty: i.qty,
    })),
  });

  await applyCJFulfillmentResult(orderId as string, cjResult, total);

  await deletePendingCheckout(params.paypalOrderId);
  return { orderId: orderId as string };
}

/**
 * Webhook safety net when /capture was never called but PayPal captured payment.
 */
export async function fulfillOrderFromWebhook(
  paypalOrderId: string
): Promise<{ orderId: string } | { skipped: true } | { error: string }> {
  const existingId = await getExistingOrderByPaypalId(paypalOrderId);
  if (existingId) {
    return { orderId: existingId };
  }

  const pending = await getPendingCheckout(paypalOrderId);
  if (!pending) {
    console.warn(
      "[webhook] No pending checkout for PayPal order:",
      paypalOrderId
    );
    return { skipped: true };
  }

  if (!pending.shipping) {
    console.warn(
      "[webhook] Pending checkout missing shipping for PayPal order:",
      paypalOrderId
    );
    return { skipped: true };
  }

  return fulfillOrder({
    paypalOrderId,
    userId: pending.user_id,
    items: pending.items,
    shipping: pending.shipping,
  });
}
