"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateOrderStatusAction } from "@/app/admin/orders/actions";
import { ADMIN_UPDATABLE_STATUSES } from "@/lib/order-status";
import type { AdminOrderDetail } from "@/lib/admin-queries";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variant-utils";
import Link from "next/link";

export function OrderDetailPanel({ order }: { order: AdminOrderDetail }) {
  const router = useRouter();
  const [status, setStatus] = useState(order.status);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const shipping = order.shipping;

  function handleStatusUpdate() {
    startTransition(async () => {
      const result = await updateOrderStatusAction(order.id, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Order status updated");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/orders"
            className="text-sm text-muted-foreground hover:text-current"
          >
            ← All orders
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold">
            Order {order.id.slice(0, 8)}…
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.customer_email} · {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Shipping
          </h2>
          <address className="mt-3 not-italic text-sm leading-relaxed">
            {shipping.firstName} {shipping.lastName}
            <br />
            {shipping.address}
            <br />
            {shipping.city}, {shipping.country}
            <br />
            {shipping.phone}
          </address>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Payment
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="tabular-price font-medium">
                {formatPrice(order.total)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">PayPal ID</dt>
              <dd className="truncate font-mono text-xs">
                {order.paypal_order_id ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">CJ order</dt>
              <dd className="truncate font-mono text-xs">
                {order.cj_order_id ?? "—"}
              </dd>
            </div>
            {order.tracking_number && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">Tracking</dt>
                <dd className="font-mono text-xs">{order.tracking_number}</dd>
              </div>
            )}
            {order.fulfillment_note && (
              <div>
                <dt className="text-muted-foreground">Fulfillment note</dt>
                <dd className="mt-1 text-xs">{order.fulfillment_note}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Line items
        </h2>
        <div className="mt-3 divide-y divide-border">
          {order.items.map((item) => {
            const label = formatVariantLabel(item.color, item.size);
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    SKU {item.sku}
                    {label ? ` · ${label}` : ""}
                  </p>
                </div>
                <p className="tabular-price">
                  {item.qty} × {formatPrice(item.price)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Update status
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="order-status">Status</Label>
            <select
              id="order-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
            >
              {ADMIN_UPDATABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          {!confirmOpen ? (
            <Button
              type="button"
              variant="outline"
              disabled={status === order.status}
              onClick={() => setConfirmOpen(true)}
            >
              Review change
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-coral-pulse/30 bg-coral-pulse/5 px-3 py-2">
              <p className="text-sm">
                Change status to{" "}
                <strong className="capitalize">
                  {status.replace(/_/g, " ")}
                </strong>
                ?
              </p>
              <Button
                size="sm"
                onClick={handleStatusUpdate}
                disabled={pending}
              >
                {pending ? "Saving…" : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirmOpen(false);
                  setStatus(order.status);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
