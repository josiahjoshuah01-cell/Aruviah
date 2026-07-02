import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OrderDetailPanel } from "@/components/admin/order-detail-panel";
import { getAdminOrderDetail } from "@/lib/admin-queries";
import { canFileCjDispute } from "@/lib/cj-dispute-eligibility";
import { listDisputesForOrder } from "@/lib/dispute-queries";

import { syncCjOrderTracking } from "@/lib/cj-tracking";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id.slice(0, 8)}` };
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let order = await getAdminOrderDetail(id);
  if (!order) notFound();

  if (order.cj_order_id) {
    await syncCjOrderTracking(id);
    order = (await getAdminOrderDetail(id)) ?? order;
  }

  const disputes =
    order && canFileCjDispute(order)
      ? await listDisputesForOrder(order.id)
      : [];

  return <OrderDetailPanel order={order} disputes={disputes} />;
}
