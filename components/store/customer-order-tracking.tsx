import Link from "next/link";
import { ExternalLink, Package } from "lucide-react";
import { resolvePackageTrackingUrl } from "@/lib/order-tracking";

export type CustomerOrderTrackingProps = {
  trackNumber?: string | null;
  trackingUrl?: string | null;
  trackingStatus?: string | null;
  lastMileCarrier?: string | null;
};

export function CustomerOrderTracking({
  trackNumber,
  trackingUrl,
  trackingStatus,
  lastMileCarrier,
}: CustomerOrderTrackingProps) {
  const number = trackNumber?.trim();
  const trackHref = resolvePackageTrackingUrl(number, trackingUrl);
  const status = trackingStatus?.trim();
  const carrier = lastMileCarrier?.trim();

  if (!number) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Preparing your order</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tracking will appear here once your package ships. We&apos;ll
              update this page automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-stream/30 bg-stream/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-medium text-stream">
            <Package className="h-4 w-4" />
            Package tracking
          </p>
          {status && (
            <p className="text-sm font-medium text-foreground">{status}</p>
          )}
          {carrier && (
            <p className="text-sm text-muted-foreground">
              Carrier: {carrier}
            </p>
          )}
          <p className="font-mono text-sm">{number}</p>
        </div>
        {trackHref && (
          <Link
            href={trackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-stream px-3 py-2 text-sm font-medium text-mist hover:bg-stream/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
          >
            Track package
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
