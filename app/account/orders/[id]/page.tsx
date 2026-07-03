import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { AccountShell } from "@/components/store/account-shell";
import { CustomerOrderStatusBadge } from "@/components/store/customer-order-status-badge";
import { CustomerOrderTracking } from "@/components/store/customer-order-tracking";
import { OrderStatusTimeline } from "@/components/store/order-status-timeline";
import { customerHasOpenDisputeForOrder } from "@/lib/dispute-queries";
import { getCustomerOrderDisplay } from "@/lib/order-status-display";
import { getOrderItems, getUserOrderById } from "@/lib/queries";
import { formatVariantLabel } from "@/lib/variant-utils";
import { formatPrice } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { AlertCircle } from "lucide-react";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Order ${id.slice(0, 8)}`,
  };
}

function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/account/orders/${id}`)}`);
  }

  const order = await getUserOrderById(id);
  if (!order) notFound();

  const [items, hasOpenDispute] = await Promise.all([
    getOrderItems(order.id),
    customerHasOpenDisputeForOrder(order.id, user.id),
  ]);

  const display = getCustomerOrderDisplay(order);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shippingTotal = items.reduce(
    (sum, item) =>
      sum + (item.variant?.shipping_cost_usd ?? 0) * item.qty,
    0
  );
  const shipping = order.shipping;

  return (
    <AccountShell backHref="/account/orders">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Order details</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatOrderDate(order.created_at)}
          </p>
        </div>
        <CustomerOrderStatusBadge order={order} />
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{display.description}</p>

      {hasOpenDispute && (
        <div
          className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
          role="status"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <p>
            We&apos;re looking into an issue with this order. Our team will
            reach out if we need anything from you.
          </p>
        </div>
      )}

      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </h2>
        <div className="mt-4">
          <OrderStatusTimeline order={order} />
        </div>
      </section>

      <section className="mt-4">
        <CustomerOrderTracking
          trackNumber={order.cj_track_number}
          trackingUrl={order.cj_tracking_url}
          trackingStatus={order.cj_tracking_status}
          lastMileCarrier={order.cj_last_mile_carrier}
        />
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Items
        </h2>
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) => {
            const imageUrl =
              item.variant?.image_url ??
              item.variant?.product?.image_url ??
              null;
            const variantLabel = formatVariantLabel(
              item.variant?.color ?? null,
              item.variant?.size ?? null
            );

            return (
              <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.variant?.product?.title ?? "Product"}
                  </p>
                  {variantLabel && (
                    <p className="text-sm text-muted-foreground">
                      {variantLabel}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Qty {item.qty}
                  </p>
                </div>
                <p className="tabular-price shrink-0 text-sm font-medium">
                  {formatPrice(item.price * item.qty)}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Shipping address
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
            Summary
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-price">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd className="tabular-price">
                {shippingTotal > 0 ? formatPrice(shippingTotal) : "Free"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-2 font-medium">
              <dt>Total</dt>
              <dd className="tabular-price">{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </AccountShell>
  );
}
