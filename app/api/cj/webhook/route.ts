import { NextResponse } from "next/server";
import { verifyCjWebhookSignature } from "@/lib/cj-webhook-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendShippedEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderParams = {
  orderNumber?: string;
  cjOrderId?: string;
  orderStatus?: string;
  logisticName?: string;
  trackNumber?: string | null;
  trackingUrl?: string | null;
  trackingProvider?: string | null;
  payDate?: string | null;
  deliveryDate?: string | null;
};

type LogisticParams = {
  orderId?: string;
  storeOrderNumbers?: string[];
  logisticName?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingProvider?: string | null;
  trackingStatus?: number | null;
};

type WebhookPayload = {
  messageId: string;
  type: string;
  messageType?: string;
  openId?: number;
  params: OrderParams | LogisticParams | Record<string, unknown>;
};

const CJ_OK = { code: 200, result: "success", message: "ok" };

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sign = request.headers.get("sign") ?? "";

  if (!verifyCjWebhookSignature(rawBody, sign)) {
    return NextResponse.json(
      { code: 401, result: "error", message: "Invalid signature" },
      { status: 401 }
    );
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    console.error("[cj-webhook] Invalid JSON body");
    return NextResponse.json(CJ_OK);
  }

  const { messageId, type, messageType } = payload;
  if (!messageId) {
    return NextResponse.json(CJ_OK);
  }

  const supabase = createServiceClient();

  try {
    const { data: existing } = await supabase
      .from("cj_webhook_events")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(CJ_OK);
    }

    await supabase.from("cj_webhook_events").insert({
      message_id: messageId,
      type,
      message_type: messageType ?? null,
      raw_payload: payload,
      processed: false,
    });

    if (type === "ORDER") {
      await handleOrderMessage(supabase, payload);
    } else if (type === "LOGISTIC") {
      await handleLogisticMessage(supabase, payload);
    }

    await supabase
      .from("cj_webhook_events")
      .update({ processed: true })
      .eq("message_id", messageId);
  } catch (err) {
    console.error("[cj-webhook] Processing error:", err);
  }

  return NextResponse.json(CJ_OK);
}

function cjStatusToAruviahStatus(
  cjStatus: string | undefined,
  currentStatus: string
): string | null {
  if (!cjStatus) return null;
  const s = cjStatus.toUpperCase();

  if (
    (s.includes("SHIP") || s === "IN_TRANSIT" || s === "500" || s === "600") &&
    ["paid", "fulfilling", "paid_fulfillment_pending"].includes(currentStatus)
  ) {
    return "shipped";
  }

  return null;
}

async function handleOrderMessage(
  supabase: ReturnType<typeof createServiceClient>,
  payload: WebhookPayload
) {
  const params = payload.params as OrderParams;
  const cjOrderId = params.cjOrderId;
  if (!cjOrderId) return;

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, cj_track_number, shipped_email_sent_at"
    )
    .eq("cj_order_id", cjOrderId)
    .maybeSingle();

  if (!order) {
    console.warn(
      `[cj-webhook] ORDER: no matching order for cjOrderId=${cjOrderId}`
    );
    return;
  }

  const patch: Record<string, unknown> = {};

  if (params.trackNumber?.trim() && !order.cj_track_number) {
    patch.cj_track_number = params.trackNumber.trim();
    patch.tracking_number = params.trackNumber.trim();
  }
  if (params.trackingProvider?.trim()) {
    patch.cj_tracking_provider = params.trackingProvider.trim();
  }
  if (params.trackingUrl?.trim()) {
    patch.cj_tracking_url = params.trackingUrl.trim();
  }
  if (params.logisticName?.trim()) {
    patch.cj_last_mile_carrier = params.logisticName.trim();
  }

  const newStatus = cjStatusToAruviahStatus(params.orderStatus, order.status);
  if (newStatus) {
    patch.status = newStatus;
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from("orders").update(patch).eq("id", order.id);
  }

  const hadTrackingBefore = !!order.cj_track_number?.trim();
  const hasTrackingNow = !!(
    patch.cj_track_number || order.cj_track_number?.trim()
  );

  if (hasTrackingNow && !hadTrackingBefore && !order.shipped_email_sent_at) {
    await trySendShippedFromWebhook(supabase, order.id, order.user_id);
  }
}

async function handleLogisticMessage(
  supabase: ReturnType<typeof createServiceClient>,
  payload: WebhookPayload
) {
  const params = payload.params as LogisticParams;
  const cjOrderId = params.orderId;
  if (!cjOrderId) return;

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, cj_track_number, shipped_email_sent_at"
    )
    .eq("cj_order_id", cjOrderId)
    .maybeSingle();

  if (!order) {
    console.warn(
      `[cj-webhook] LOGISTIC: no matching order for cjOrderId=${cjOrderId}`
    );
    return;
  }

  const patch: Record<string, unknown> = {};

  if (params.trackingNumber?.trim() && !order.cj_track_number) {
    patch.cj_track_number = params.trackingNumber.trim();
    patch.tracking_number = params.trackingNumber.trim();
  }
  if (params.trackingProvider?.trim()) {
    patch.cj_tracking_provider = params.trackingProvider.trim();
  }
  if (params.trackingUrl?.trim()) {
    patch.cj_tracking_url = params.trackingUrl.trim();
  }
  if (params.logisticName?.trim()) {
    patch.cj_last_mile_carrier = params.logisticName.trim();
  }

  if (params.trackingStatus != null) {
    const statusMap: Record<number, string> = {
      0: "No tracking info",
      1: "Warehouse Shipped",
      2: "Forwarder Received",
      3: "Forwarder Return",
      4: "Forwarder Dispatched",
      5: "International Transit",
      6: "Arrived at Destination",
      7: "Customs Clearance",
      8: "Customs Cleared",
      9: "Last-Mile Pickup",
      10: "Out for Delivery",
      11: "Ready for Pickup",
      12: "Delivered",
      13: "Delivery Failed",
      14: "Return",
    };
    patch.cj_tracking_status =
      statusMap[params.trackingStatus] ?? `Status ${params.trackingStatus}`;
  }

  const shouldMarkShipped =
    params.trackingStatus != null &&
    params.trackingStatus >= 1 &&
    ["paid", "fulfilling", "paid_fulfillment_pending"].includes(order.status);

  if (shouldMarkShipped) {
    patch.status = "shipped";
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from("orders").update(patch).eq("id", order.id);
  }

  const hadTrackingBefore = !!order.cj_track_number?.trim();
  const hasTrackingNow = !!(
    patch.cj_track_number || order.cj_track_number?.trim()
  );

  if (hasTrackingNow && !hadTrackingBefore && !order.shipped_email_sent_at) {
    await trySendShippedFromWebhook(supabase, order.id, order.user_id);
  }
}

async function trySendShippedFromWebhook(
  supabase: ReturnType<typeof createServiceClient>,
  orderId: string,
  userId: string
) {
  try {
    const { data: freshOrder } = await supabase
      .from("orders")
      .select(
        "cj_track_number, cj_tracking_url, cj_last_mile_carrier, shipped_email_sent_at"
      )
      .eq("id", orderId)
      .single();

    if (!freshOrder || freshOrder.shipped_email_sent_at) return;

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) return;

    const sent = await sendShippedEmail({
      orderId,
      userEmail: email,
      carrier: freshOrder.cj_last_mile_carrier || null,
      trackNumber: freshOrder.cj_track_number || null,
      trackingUrl: freshOrder.cj_tracking_url || null,
    });

    if (sent) {
      await supabase
        .from("orders")
        .update({ shipped_email_sent_at: new Date().toISOString() })
        .eq("id", orderId);
    }
  } catch (err) {
    console.error("[cj-webhook] Failed to send shipped email:", err);
  }
}
