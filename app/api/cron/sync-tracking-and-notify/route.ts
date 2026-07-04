import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { syncCjOrderTracking } from "@/lib/cj-tracking";
import { sendShippedEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: orders, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, cj_order_id, cj_track_number, shipped_email_sent_at"
    )
    .in("status", ["paid", "shipped", "fulfilling", "paid_fulfillment_pending"])
    .not("cj_order_id", "is", null)
    .is("shipped_email_sent_at", null)
    .limit(50);

  if (fetchError) {
    console.error("[cron] Failed to fetch orders:", fetchError);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ processed: 0, shipped: 0 });
  }

  let processed = 0;
  let shipped = 0;

  for (const order of orders) {
    processed++;

    const hadTrackingBefore = !!order.cj_track_number?.trim();

    const result = await syncCjOrderTracking(order.id);
    if (!result.ok) {
      console.warn(
        `[cron] Tracking sync failed for ${order.id}:`,
        result.error
      );
      continue;
    }

    const hasTrackingNow = !!result.tracking?.cj_track_number?.trim();

    if (!hasTrackingNow) continue;
    if (hadTrackingBefore) continue;

    const { data: authUser } = await supabase.auth.admin.getUserById(
      order.user_id
    );
    const email = authUser?.user?.email;
    if (!email) continue;

    const { data: freshOrder } = await supabase
      .from("orders")
      .select(
        "cj_track_number, cj_tracking_url, cj_last_mile_carrier, cj_tracking_status"
      )
      .eq("id", order.id)
      .single();

    const sent = await sendShippedEmail({
      orderId: order.id,
      userEmail: email,
      carrier:
        freshOrder?.cj_last_mile_carrier ||
        result.tracking?.cj_tracking_provider ||
        null,
      trackNumber: freshOrder?.cj_track_number || null,
      trackingUrl: freshOrder?.cj_tracking_url || null,
    });

    if (sent) {
      await supabase
        .from("orders")
        .update({ shipped_email_sent_at: new Date().toISOString() })
        .eq("id", order.id);
      shipped++;
    }
  }

  return NextResponse.json({ processed, shipped });
}
