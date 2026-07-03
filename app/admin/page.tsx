import Link from "next/link";
import { getAdminNavBadges, getAdminOverviewStats } from "@/lib/admin-queries";
import { formatPrice } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function AdminOverviewPage() {
  const [badges, stats] = await Promise.all([
    getAdminNavBadges(),
    getAdminOverviewStats(),
  ]);

  const excludedFootnote =
    stats.lineItemUnitsWithoutCost > 0
      ? `${stats.lineItemUnitsWithoutCost} unit(s) across ${stats.lineItemsWithoutCost} line item(s) excluded — no cost on file (e.g. original placeholder catalog).`
      : "All paid line items include cost data.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Store performance across paid orders.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Paid orders</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {stats.paidOrderCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Revenue</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-price">
            {formatPrice(stats.revenueUsd)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Order totals (paid+ statuses)
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Gross profit</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-price text-stream">
            {formatPrice(stats.grossProfitUsd)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.lineItemUnitsWithCost} unit(s) with cost on file
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Profit margin</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {stats.profitMarginPct != null
              ? `${stats.profitMarginPct.toFixed(1)}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            On line items with recorded cost only
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{excludedFootnote}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/fulfillment"
          className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-stream/40"
        >
          <p className="text-sm text-muted-foreground">Fulfillment queue</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {badges.fulfillmentCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Orders stuck awaiting manual fulfillment
          </p>
        </Link>
        <Link
          href="/admin/staging"
          className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-stream/40"
        >
          <p className="text-sm text-muted-foreground">Pending staging</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {badges.stagingPendingCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            CJ products awaiting review
          </p>
        </Link>
        <Link
          href="/admin/settings"
          className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-stream/40"
        >
          <p className="text-sm text-muted-foreground">CJ payment due</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {badges.cjUnpaidCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Orders created on CJ, awaiting wallet payment
          </p>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-stream/40"
        >
          <p className="text-sm text-muted-foreground">Orders</p>
          <p className="mt-1 text-sm font-medium text-stream">
            View all orders →
          </p>
        </Link>
      </div>
    </div>
  );
}
