/** Resolve a customer-facing package tracking URL. */
export function resolvePackageTrackingUrl(
  trackNumber: string | null | undefined,
  cjTrackingUrl: string | null | undefined
): string | null {
  const url = cjTrackingUrl?.trim();
  if (url) return url;

  const number = trackNumber?.trim();
  if (!number) return null;

  return `https://cjpacket.com/?trackingNumber=${encodeURIComponent(number)}`;
}
