import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cjOrderPaymentUrl } from "@/lib/cj-payment-types";
import type { CjPaymentStatus } from "@/lib/cj-payment-types";

export function CjPaymentStatusBadge({
  status,
}: {
  status: CjPaymentStatus;
}) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center rounded-md bg-stream/15 px-2 py-0.5 text-xs font-medium text-stream">
        CJ paid
      </span>
    );
  }
  if (status === "unpaid") {
    return (
      <span className="inline-flex items-center rounded-md bg-coral-pulse/15 px-2 py-0.5 text-xs font-medium text-coral-pulse">
        Needs payment on CJ
      </span>
    );
  }
  return null;
}

export function CjPaymentNotice({
  cjOrderId,
  shipmentOrderId,
  paymentStatus,
  amountUsd,
  compact,
}: {
  cjOrderId: string | null;
  shipmentOrderId?: string | null;
  paymentStatus: CjPaymentStatus;
  amountUsd?: number | null;
  compact?: boolean;
}) {
  if (paymentStatus !== "unpaid" || !cjOrderId) return null;

  const payUrl = cjOrderPaymentUrl(cjOrderId, shipmentOrderId);

  return (
    <div
      className={
        compact
          ? "inline-flex flex-wrap items-center gap-2"
          : "rounded-md border border-coral-pulse/30 bg-coral-pulse/5 px-3 py-2 text-sm"
      }
    >
      {!compact && (
        <p className="font-medium text-coral-pulse">Needs payment on CJ</p>
      )}
      <CjPaymentStatusBadge status="unpaid" />
      {!compact && (
        <p className="mt-1 text-muted-foreground">
          This order was created on CJ but hasn&apos;t been paid from your CJ
          wallet yet.
          {amountUsd != null && amountUsd > 0
            ? ` Estimated CJ cost: $${amountUsd.toFixed(2)}.`
            : ""}
        </p>
      )}
      <Link
        href={payUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium text-stream hover:underline"
      >
        Pay on CJ
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
