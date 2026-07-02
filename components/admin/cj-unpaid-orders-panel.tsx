import Link from "next/link";
import { CjPaymentNotice } from "@/components/admin/cj-payment-notice";
import { CjTrackingNotice } from "@/components/admin/cj-tracking-notice";
import type { AdminOrderRow } from "@/lib/admin-queries";
import { formatPrice } from "@/lib/utils";

export function CjUnpaidOrdersPanel({ orders }: { orders: AdminOrderRow[] }) {
  if (orders.length === 0) return null;

  return (
    <section className="rounded-xl border border-coral-pulse/30 bg-coral-pulse/5 p-4">
      <h2 className="font-display text-sm font-semibold text-coral-pulse">
        CJ payment required ({orders.length})
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        These orders exist on CJ but haven&apos;t been paid from your CJ wallet.
        Pay manually on CJ or enable auto-pay in Settings.
      </p>
      <ul className="mt-4 space-y-3">
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <div>
              <Link
                href={`/admin/orders/${order.id}`}
                className="font-mono text-xs font-medium text-stream hover:underline"
              >
                {order.id.slice(0, 8)}…
              </Link>
              <p className="text-xs text-muted-foreground">
                {order.customer_email} · {formatPrice(order.total)} · CJ{" "}
                {order.cj_order_id ?? "—"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <CjPaymentNotice
                compact
                cjOrderId={order.cj_order_id}
                shipmentOrderId={order.cj_shipment_order_id}
                paymentStatus={order.cj_payment_status}
                amountUsd={order.cj_order_amount_usd}
              />
              <CjTrackingNotice
                compact
                trackNumber={order.cj_track_number}
                trackingProvider={order.cj_tracking_provider}
                trackingUrl={order.cj_tracking_url}
                trackingStatus={order.cj_tracking_status}
                lastMileCarrier={order.cj_last_mile_carrier}
                lastMileTrackNumber={order.cj_last_mile_track_number}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
