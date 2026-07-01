"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitReview } from "@/app/(store)/product/[id]/actions";

export function ReviewForm({
  productId,
  orderId,
}: {
  productId: string;
  orderId: string;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      toast.error("Please select a star rating");
      return;
    }

    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("orderId", orderId);
    formData.set("rating", String(rating));
    formData.set("comment", comment);

    startTransition(async () => {
      const result = await submitReview(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Review submitted");
      setRating(0);
      setComment("");
    });
  }

  const display = hover || rating;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border p-4">
      <h3 className="font-display text-lg font-semibold">Write a review</h3>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => {
          const star = i + 1;
          const filled = star <= display;
          return (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
              className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-colors",
                  filled
                    ? "fill-sun-glint text-sun-glint"
                    : "fill-transparent text-muted-foreground/50 hover:text-sun-glint/70"
                )}
              />
            </button>
          );
        })}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience (optional)"
        rows={4}
        className="w-full resize-none rounded-md border border-input bg-mist px-3 py-2 text-sm text-current placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
      />
      <Button type="submit" disabled={pending || rating < 1}>
        {pending ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}
