import Link from "next/link";
import { AccountShell } from "@/components/store/account-shell";

export default function OrderNotFound() {
  return (
    <AccountShell backHref="/account/orders">
      <h1 className="font-display text-2xl font-bold">Order not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This order doesn&apos;t exist or isn&apos;t linked to your account.
      </p>
      <Link
        href="/account/orders"
        className="mt-6 inline-flex text-sm font-medium text-stream hover:underline"
      >
        View your orders
      </Link>
    </AccountShell>
  );
}
