import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OrderDetailPanel } from "@/components/admin/order-detail-panel";
import { getAdminOrderDetail } from "@/lib/admin-queries";

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
  const order = await getAdminOrderDetail(id);
  if (!order) notFound();

  return <OrderDetailPanel order={order} />;
}
