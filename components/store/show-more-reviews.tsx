"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/store/star-rating";
import { createClient } from "@/lib/supabase/client";
import type { ReviewWithAuthor } from "@/lib/types";

export function ShowMoreReviews({
  productId,
  totalCount,
}: {
  productId: string;
  totalCount: number;
}) {
  const [reviews, setReviews] = useState<ReviewWithAuthor[]>([]);
  const [offset, setOffset] = useState(10);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function loadMore() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("reviews")
      .select("id, product_id, user_id, order_id, rating, comment, created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .range(offset, offset + 9);

    const mapped = (data ?? []).map((r) => ({
      ...r,
      author_name: "Verified Buyer",
    }));

    setReviews((prev) => [...prev, ...mapped]);
    setOffset((o) => o + 10);
    setExpanded(true);
    setLoading(false);
  }

  const hasMore = offset < totalCount;

  return (
    <div className="mb-8">
      {expanded && (
        <ul className="mb-4 space-y-4">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="rounded-lg border border-border bg-mist p-4 dark:bg-current/5"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{review.author_name}</span>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={review.created_at}
                >
                  {new Date(review.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </div>
              <StarRating rating={review.rating} size="sm" className="mb-2" />
              {review.comment && (
                <p className="text-sm leading-relaxed text-current/90">
                  {review.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={loadMore}
          disabled={loading}
        >
          {loading ? "Loading…" : "Show more reviews"}
        </Button>
      )}
    </div>
  );
}
