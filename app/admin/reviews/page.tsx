import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reviews" };

export default function AdminReviewsPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <h1 className="font-display text-xl font-bold">Reviews</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Review moderation — coming in the next admin phase.
      </p>
    </div>
  );
}
