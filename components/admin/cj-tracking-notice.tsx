import Link from "next/link";
import { ExternalLink, Package } from "lucide-react";

export type CjTrackingProps = {
  trackNumber?: string | null;
  trackingProvider?: string | null;
  trackingUrl?: string | null;
  trackingStatus?: string | null;
  lastMileCarrier?: string | null;
  lastMileTrackNumber?: string | null;
  compact?: boolean;
};

export function CjTrackingNotice({
  trackNumber,
  trackingProvider,
  trackingUrl,
  trackingStatus,
  lastMileCarrier,
  lastMileTrackNumber,
  compact = false,
}: CjTrackingProps) {
  const number = trackNumber?.trim();
  const provider = trackingProvider?.trim();
  const url = trackingUrl?.trim();
  const status = trackingStatus?.trim();
  const lastMile = lastMileCarrier?.trim();
  const lastMileNum = lastMileTrackNumber?.trim();

  if (!number && !provider && !url && !status && !lastMile && !lastMileNum) {
    return null;
  }

  return (
    <div
      className={
        compact
          ? "inline-flex flex-wrap items-center gap-2 text-xs"
          : "rounded-md border border-stream/30 bg-stream/5 px-3 py-2 text-sm"
      }
    >
      {!compact && (
        <p className="flex items-center gap-1.5 font-medium text-stream">
          <Package className="h-4 w-4" />
          CJ shipment tracking
        </p>
      )}
      <div className={compact ? "flex flex-wrap items-center gap-2" : "mt-1 space-y-1"}>
        {status && (
          <span
            className={
              compact
                ? "rounded bg-muted px-1.5 py-0.5 font-medium text-foreground"
                : "font-medium text-foreground"
            }
          >
            {compact ? status : `Status: ${status}`}
          </span>
        )}
        {provider && (
          <span className="text-muted-foreground">
            {compact ? provider : `Carrier: ${provider}`}
          </span>
        )}
        {number && <span className="font-mono text-xs">{number}</span>}
        {lastMile && lastMileNum && (
          <span className="text-muted-foreground">
            {compact
              ? `${lastMile}: ${lastMileNum}`
              : `Last mile (${lastMile}): ${lastMileNum}`}
          </span>
        )}
        {url && (
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-stream hover:underline"
          >
            Track shipment
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
