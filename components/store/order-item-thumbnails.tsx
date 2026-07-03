import Image from "next/image";
import type { UserOrderSummary } from "@/lib/types";

function itemImageUrl(
  item: UserOrderSummary["order_items"][number]
): string | null {
  return (
    item.variant?.image_url ??
    item.variant?.product?.image_url ??
    null
  );
}

export function OrderItemThumbnails({
  items,
  maxVisible = 3,
}: {
  items: UserOrderSummary["order_items"];
  maxVisible?: number;
}) {
  const urls = items
    .map(itemImageUrl)
    .filter((url): url is string => !!url);
  const uniqueUrls = [...new Set(urls)];
  const visible = uniqueUrls.slice(0, maxVisible);
  const remaining = Math.max(items.length - maxVisible, 0);

  if (visible.length === 0) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
        —
      </div>
    );
  }

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="relative h-10 w-10 overflow-hidden rounded-md border-2 border-background bg-muted"
          style={{ zIndex: visible.length - i }}
        >
          <Image
            src={url}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className="relative z-0 flex h-10 w-10 items-center justify-center rounded-md border-2 border-background bg-muted text-xs font-medium text-muted-foreground"
          aria-label={`${remaining} more items`}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
