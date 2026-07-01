import Link from "next/link";
import {
  getProductReviews,
  getReviewEligibility,
  getReviewSummary,
} from "@/lib/queries";
import { StarRating } from "@/components/store/star-rating";
import { ReviewForm } from "@/components/store/review-form";
import { ShowMoreReviews } from "@/components/store/show-more-reviews";

export async function ProductReviews({ productId }: { productId: string }) {
  const [summary, reviews, eligibility] = await Promise.all([
    getReviewSummary(productId),
    getProductReviews(productId, { limit: 10 }),
    getReviewEligibility(productId),
  ]);

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="mb-4 font-display text-xl font-bold">Reviews</h2>

      {summary.review_count > 0 ? (
        <p className="mb-6 flex items-center gap-2 text-sm">
          <span className="tabular-price font-semibold">
            {summary.average_rating.toFixed(1)}
          </span>
          <StarRating rating={summary.average_rating} />
          <span className="text-muted-foreground">
            ({summary.review_count} review
            {summary.review_count === 1 ? "" : "s"})
          </span>
        </p>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">No reviews yet</p>
      )}

      {reviews.length > 0 && (
        <ul className="mb-8 space-y-4">
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

      {summary.review_count > 10 && (
        <ShowMoreReviews
          productId={productId}
          totalCount={summary.review_count}
        />
      )}

      {eligibility.status === "anonymous" && (
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/login?redirect=/product/${productId}`}
            className="font-medium text-stream underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
          >
            Sign in
          </Link>{" "}
          to leave a review
        </p>
      )}

      {eligibility.status === "eligible" && (
        <ReviewForm productId={productId} orderId={eligibility.orderId} />
      )}

      {eligibility.status === "already_reviewed" && (
        <p className="text-sm font-medium text-stream">You reviewed this</p>
      )}
    </section>
  );
}
