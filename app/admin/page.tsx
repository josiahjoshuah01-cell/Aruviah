import Link from "next/link";
import { getAdminNavBadges } from "@/lib/admin-queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function AdminOverviewPage() {
  const badges = await getAdminNavBadges();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin dashboard — more metrics coming in the next phase.
        </p>
      </div>

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
