import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/store/account-shell";
import { CustomerOrderStatusBadge } from "@/components/store/customer-order-status-badge";
import { OrderItemThumbnails } from "@/components/store/order-item-thumbnails";
import { getUserOrdersWithItems } from "@/lib/queries";
import { formatPrice } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your orders",
};

function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/account/orders");

  const orders = await getUserOrdersWithItems();

  return (
    <AccountShell>
      <h1 className="font-display text-2xl font-bold">Your orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Track packages and view order details.
      </p>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center">
          <p className="font-medium">No orders yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            When you place an order, it will show up here with tracking updates.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-md bg-stream px-4 py-2 text-sm font-medium text-mist hover:bg-stream/90"
          >
            Browse the store
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/account/orders/${order.id}`}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-stream/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
              >
                <OrderItemThumbnails items={order.order_items} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">
                    {formatOrderDate(order.created_at)}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium">
                    {order.order_items.length === 1
                      ? (order.order_items[0]?.variant?.product?.title ??
                        "Order")
                      : `${order.order_items.length} items`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <CustomerOrderStatusBadge order={order} />
                  <p className="tabular-price text-sm font-semibold">
                    {formatPrice(order.total)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
