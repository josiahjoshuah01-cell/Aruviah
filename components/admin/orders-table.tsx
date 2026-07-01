"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { CjPaymentStatusBadge } from "@/components/admin/cj-payment-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORDER_STATUSES } from "@/lib/order-status";
import type { AdminOrderRow } from "@/lib/admin-queries";
import { formatPrice } from "@/lib/utils";

export function OrdersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "all";
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "newest";

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => {
      router.push(`/admin/orders?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <form
        className="flex flex-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          updateParams({ q: String(fd.get("q") ?? "") });
        }}
      >
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search email or order id…"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Search
        </Button>
      </form>
      <select
        value={status}
        onChange={(e) => updateParams({ status: e.target.value })}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        disabled={pending}
      >
        <option value="all">All statuses</option>
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        disabled={pending}
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
    </div>
  );
}

export function OrdersTable({ orders }: { orders: AdminOrderRow[] }) {
  if (orders.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No orders match your filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Order</th>
            <th className="px-4 py-3 font-medium">Customer</th>
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">CJ pay</th>
            <th className="px-4 py-3 font-medium">PayPal</th>
            <th className="px-4 py-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="font-mono text-xs font-medium text-stream hover:underline"
                >
                  {order.id.slice(0, 8)}…
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {order.customer_email ?? "—"}
              </td>
              <td className="px-4 py-3 tabular-price font-medium">
                {formatPrice(order.total)}
              </td>
              <td className="px-4 py-3">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="px-4 py-3">
                <CjPaymentStatusBadge status={order.cj_payment_status} />
              </td>
              <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                {order.paypal_order_id ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(order.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
