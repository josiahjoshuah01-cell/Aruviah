import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserOrders } from "@/lib/queries";
import { formatPrice } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your orders",
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/account/orders");

  const orders = await getUserOrders();

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-border px-4 py-4 md:px-6">
        <Link href="/" className="font-display text-xl font-bold">
          Aruviah
        </Link>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <h1 className="mb-6 font-display text-2xl font-bold">Your orders</h1>
        {orders.length === 0 ? (
          <p className="text-muted-foreground">
            No orders yet.{" "}
            <Link href="/" className="text-stream hover:underline">
              Start shopping
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      #{order.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-price font-semibold">
                      {formatPrice(order.total)}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {order.status.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
