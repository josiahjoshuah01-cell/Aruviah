import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrderById, getOrderItems } from "@/lib/queries";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order confirmed",
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderId } = await searchParams;

  if (!orderId) redirect("/");

  const order = await getOrderById(orderId);
  if (!order) redirect("/");

  const items = await getOrderItems(orderId);

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-border px-4 py-4 md:px-6">
        <Link href="/" className="font-display text-xl font-bold">
          Aruviah
        </Link>
      </header>
      <div className="mx-auto max-w-lg px-4 py-12 text-center md:px-6">
        <div className="mb-2 h-1 w-16 mx-auto bg-stream rounded-full" />
        <h1 className="font-display text-2xl font-bold">Order confirmed</h1>
        <p className="mt-2 text-muted-foreground">
          Thank you — your order is on its way.
        </p>
        <p className="mt-4 tabular-price text-sm text-muted-foreground">
          Order #{order.id.slice(0, 8)}
        </p>
        <p className="tabular-price text-xl font-semibold mt-1">
          {formatPrice(order.total)}
        </p>

        <div className="mt-8 space-y-3 text-left">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.variant?.product?.title ?? "Product"} × {item.qty}
              </span>
              <span className="tabular-price">
                {formatPrice(item.price * item.qty)}
              </span>
            </div>
          ))}
        </div>

        <Button asChild className="mt-8">
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
