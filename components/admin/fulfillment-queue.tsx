"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markManuallyFulfilledAction } from "@/app/admin/orders/actions";
import {
  inferFulfillmentStuckReason,
  type AdminOrderDetail,
} from "@/lib/admin-queries";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variant-utils";

function FulfillmentCard({ order }: { order: AdminOrderDetail }) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const reason = inferFulfillmentStuckReason(order);

  function handleFulfill() {
    startTransition(async () => {
      const result = await markManuallyFulfilledAction(order.id, tracking);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Marked as shipped");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/admin/orders/${order.id}`}
            className="font-mono text-sm font-medium text-stream hover:underline"
          >
            {order.id.slice(0, 8)}…
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.customer_email} · {formatPrice(order.total)} ·{" "}
            {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-4 rounded-md border border-coral-pulse/25 bg-coral-pulse/5 px-3 py-2 text-sm">
        <p className="font-medium text-coral-pulse">Why it&apos;s stuck</p>
        <p className="mt-1 text-muted-foreground">{reason}</p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Line items to fulfill
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          {order.items.map((item) => {
            const label = formatVariantLabel(item.color, item.size);
            return (
              <li
                key={item.id}
                className="flex justify-between gap-2 border-b border-border pb-2 last:border-0"
              >
                <span>
                  {item.title}
                  <span className="block text-xs text-muted-foreground">
                    SKU {item.sku}
                    {label ? ` · ${label}` : ""}
                  </span>
                </span>
                <span className="tabular-price shrink-0">×{item.qty}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="space-y-1">
          <Label htmlFor={`tracking-${order.id}`}>
            Tracking number (optional)
          </Label>
          <Input
            id={`tracking-${order.id}`}
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="e.g. 1Z999AA10123456784"
          />
        </div>
        {!confirmOpen ? (
          <Button type="button" onClick={() => setConfirmOpen(true)}>
            Mark as manually fulfilled
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm">Mark this order as shipped?</p>
            <Button onClick={handleFulfill} disabled={pending}>
              {pending ? "Saving…" : "Confirm shipped"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

export function FulfillmentQueue({ orders }: { orders: AdminOrderDetail[] }) {
  if (orders.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No orders in the fulfillment queue — CJ auto-fulfillment is caught up.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => (
        <FulfillmentCard key={order.id} order={order} />
      ))}
    </div>
  );
}
