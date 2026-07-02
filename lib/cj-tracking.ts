/**
 * Pull CJ shipment tracking from getOrderDetail + live trackInfo, persist on orders.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getCjOrderDetail, getCjTrackInfo } from "@/lib/cj";

export type CjTrackingFields = {
  cj_track_number: string | null;
  cj_tracking_provider: string | null;
  cj_tracking_url: string | null;
  cj_tracking_status: string | null;
  cj_last_mile_carrier: string | null;
  cj_last_mile_track_number: string | null;
};

function hasTracking(detail: {
  trackNumber?: string | null;
  trackingProvider?: string | null;
  trackingUrl?: string | null;
}): boolean {
  return !!(
    detail.trackNumber?.trim() ||
    detail.trackingProvider?.trim() ||
    detail.trackingUrl?.trim()
  );
}

function isShippedCjStatus(orderStatus: string | undefined | null): boolean {
  if (!orderStatus) return false;
  const s = orderStatus.toUpperCase();
  return (
    s.includes("SHIP") ||
    s === "500" ||
    s === "600" ||
    s.includes("DELIVER") ||
    s.includes("COMPLETE")
  );
}

/**
 * Fetch CJ order detail (+ trackInfo when a tracking number exists) and store on
 * our order row. Called from admin order detail load — not on every page view.
 */
export async function syncCjOrderTracking(
  aruviahOrderId: string
): Promise<
  | { ok: true; updated: boolean; tracking: CjTrackingFields | null }
  | { ok: false; error: string }
> {
  const supabase = createServiceClient();
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, cj_order_id, status, cj_track_number, cj_tracking_provider, cj_tracking_url, cj_tracking_status, cj_last_mile_carrier, cj_last_mile_track_number, tracking_number"
    )
    .eq("id", aruviahOrderId)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!order?.cj_order_id) {
    return { ok: true, updated: false, tracking: null };
  }

  const detail = await getCjOrderDetail(order.cj_order_id);
  if (!detail) {
    return { ok: false, error: "CJ getOrderDetail failed or returned no data" };
  }

  const tracking: CjTrackingFields = {
    cj_track_number: detail.trackNumber?.trim() || null,
    cj_tracking_provider: detail.trackingProvider?.trim() || null,
    cj_tracking_url: detail.trackingUrl?.trim() || null,
    cj_tracking_status: order.cj_tracking_status,
    cj_last_mile_carrier: order.cj_last_mile_carrier,
    cj_last_mile_track_number: order.cj_last_mile_track_number,
  };

  const trackNumberForLive =
    tracking.cj_track_number ?? order.cj_track_number?.trim() ?? null;

  if (trackNumberForLive) {
    const live = await getCjTrackInfo(trackNumberForLive);
    if (live) {
      tracking.cj_tracking_status = live.trackingStatus?.trim() || null;
      tracking.cj_last_mile_carrier = live.lastMileCarrier?.trim() || null;
      tracking.cj_last_mile_track_number = live.lastTrackNumber?.trim() || null;
    }
  }

  if (
    !hasTracking(detail) &&
    !isShippedCjStatus(detail.orderStatus) &&
    !trackNumberForLive
  ) {
    return { ok: true, updated: false, tracking: null };
  }

  const unchanged =
    order.cj_track_number === tracking.cj_track_number &&
    order.cj_tracking_provider === tracking.cj_tracking_provider &&
    order.cj_tracking_url === tracking.cj_tracking_url &&
    order.cj_tracking_status === tracking.cj_tracking_status &&
    order.cj_last_mile_carrier === tracking.cj_last_mile_carrier &&
    order.cj_last_mile_track_number === tracking.cj_last_mile_track_number;

  const shouldMarkShipped =
    (hasTracking(detail) || isShippedCjStatus(detail.orderStatus)) &&
    (order.status === "paid" ||
      order.status === "fulfilling" ||
      order.status === "paid_fulfillment_pending");

  const patch: Record<string, unknown> = { ...tracking };
  if (shouldMarkShipped) {
    patch.status = "shipped";
  }
  if (tracking.cj_track_number && !order.tracking_number) {
    patch.tracking_number = tracking.cj_track_number;
  }

  if (unchanged && !shouldMarkShipped) {
    return { ok: true, updated: false, tracking };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", aruviahOrderId);

  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true, updated: true, tracking };
}
