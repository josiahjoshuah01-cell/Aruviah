import { Suspense } from "react";
import type { Metadata } from "next";
import { OrdersFilters, OrdersTable } from "@/components/admin/orders-table";
import { listAdminOrders } from "@/lib/admin-queries";

export const metadata: Metadata = {
  title: "Orders",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const orders = await listAdminOrders({
    status: params.status,
    q: params.q,
    sort: params.sort === "oldest" ? "oldest" : "newest",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All storefront orders — filter, search, and update status.
        </p>
      </div>
      <Suspense fallback={<div className="h-10 animate-pulse rounded-md bg-muted" />}>
        <OrdersFilters />
      </Suspense>
      <OrdersTable orders={orders} />
    </div>
  );
}
