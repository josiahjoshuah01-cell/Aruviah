import type { Metadata } from "next";
import { FulfillmentQueue } from "@/components/admin/fulfillment-queue";
import { listFulfillmentQueue } from "@/lib/admin-queries";

export const metadata: Metadata = {
  title: "Fulfillment Queue",
};

export const dynamic = "force-dynamic";

export default async function AdminFulfillmentPage() {
  const orders = await listFulfillmentQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Fulfillment queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders CJ could not auto-fulfill — unmapped SKUs or API errors.
        </p>
      </div>
      <FulfillmentQueue orders={orders} />
    </div>
  );
}
