import { NextResponse } from "next/server";
import {
  fulfillOrder,
  getExistingOrderByPaypalId,
  resolveCartItems,
  updatePendingShipping,
} from "@/lib/orders";
import { SHIPPING_DRIFT_BLOCK_THRESHOLD_USD } from "@/lib/checkout-shipping";
import { verifyCjLiveStockAtCheckout } from "@/lib/cj-stock";
import {
  capturePayPalOrder,
  getPayPalAccessToken,
  getPayPalOrderAmount,
} from "@/lib/paypal";
import { captureOrderSchema, rejectsClientPricing } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (rejectsClientPricing(body)) {
      return NextResponse.json(
        { error: "Client must not send total or amount" },
        { status: 400 }
      );
    }

    const parsed = captureOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { paypalOrderId, items, shipping } = parsed.data;

    // Idempotency: return existing order without re-capturing PayPal
    const existingOrderId = await getExistingOrderByPaypalId(paypalOrderId);
    if (existingOrderId) {
      return NextResponse.json({
        success: true,
        order_id: existingOrderId,
      });
    }

    await updatePendingShipping(paypalOrderId, shipping);

    const resolved = await resolveCartItems(items, shipping.country);
    if ("error" in resolved) {
      return NextResponse.json(
        {
          error: resolved.error,
          unshippableItems: resolved.unshippableItems,
        },
        { status: 400 }
      );
    }

    const liveStock = await verifyCjLiveStockAtCheckout(
      resolved.items.map((i) => ({
        variantId: i.variantId,
        qty: i.qty,
        title: i.title,
      }))
    );
    if (!liveStock.ok) {
      return NextResponse.json({ error: liveStock.error }, { status: 400 });
    }

    const accessToken = await getPayPalAccessToken();
    const paypalQuotedAmount = await getPayPalOrderAmount(
      accessToken,
      paypalOrderId
    );

    if (paypalQuotedAmount == null) {
      return NextResponse.json(
        { error: "Could not verify PayPal order amount" },
        { status: 400 }
      );
    }

    const drift = Math.abs(resolved.total - paypalQuotedAmount);
    if (drift > SHIPPING_DRIFT_BLOCK_THRESHOLD_USD) {
      console.warn(
        `[capture] Shipping drift blocked: quoted=${paypalQuotedAmount.toFixed(2)} live=${resolved.total.toFixed(2)} drift=${drift.toFixed(2)}`
      );
      return NextResponse.json(
        {
          error:
            "Shipping rates changed since checkout started. Please refresh the page and try again.",
          code: "shipping_drift",
          quotedTotal: paypalQuotedAmount,
          liveTotal: resolved.total,
        },
        { status: 409 }
      );
    }

    if (drift > 0.01) {
      console.info(
        `[capture] Honoring PayPal amount despite minor drift: quoted=${paypalQuotedAmount.toFixed(2)} live=${resolved.total.toFixed(2)}`
      );
    }

    const capture = await capturePayPalOrder(accessToken, paypalOrderId);

    if (capture.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 }
      );
    }

    const chargedAmount = Number.isFinite(capture.amountUsd)
      ? capture.amountUsd
      : paypalQuotedAmount;

    const result = await fulfillOrder({
      paypalOrderId,
      userId: user.id,
      items,
      shipping,
      orderTotalUsd: chargedAmount,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, order_id: result.orderId });
  } catch (err) {
    console.error("[capture]", err);
    return NextResponse.json(
      { error: "Failed to capture payment" },
      { status: 500 }
    );
  }
}
