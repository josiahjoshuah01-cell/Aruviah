import type { Metadata } from "next";
import { CjUnpaidOrdersPanel } from "@/components/admin/cj-unpaid-orders-panel";
import { FulfillmentQueue } from "@/components/admin/fulfillment-queue";
import {
  listFulfillmentQueue,
  listOrdersNeedingCjPayment,
} from "@/lib/admin-queries";

export const metadata: Metadata = {
  title: "Fulfillment Queue",
};

export const dynamic = "force-dynamic";

export default async function AdminFulfillmentPage() {
  const [orders, cjUnpaid] = await Promise.all([
    listFulfillmentQueue(),
    listOrdersNeedingCjPayment(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Fulfillment queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders CJ could not auto-fulfill — unmapped SKUs or API errors. CJ
          wallet payment is tracked separately below.
        </p>
      </div>
      <CjUnpaidOrdersPanel orders={cjUnpaid} />
      <FulfillmentQueue orders={orders} />
    </div>
  );
}
