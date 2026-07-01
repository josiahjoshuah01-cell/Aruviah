"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reviewSchema } from "@/lib/validations";
import { getReviewEligibility } from "@/lib/queries";

export async function submitReview(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    productId: formData.get("productId"),
    orderId: formData.get("orderId"),
    rating: formData.get("rating"),
    comment: formData.get("comment") || undefined,
  });

  if (!parsed.success) {
    return { error: "Invalid review data" };
  }

  const { productId, orderId, rating, comment } = parsed.data;

  const eligibility = await getReviewEligibility(productId);
  if (eligibility.status !== "eligible" || eligibility.orderId !== orderId) {
    return { error: "You are not eligible to review this product" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in required" };
  }

  const { error } = await supabase.from("reviews").insert({
    product_id: productId,
    user_id: user.id,
    order_id: orderId,
    rating,
    comment: comment?.trim() || null,
  });

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Purchase verification failed — only verified buyers can review"
          : error.message,
    };
  }

  revalidatePath(`/product/${productId}`);
  return { success: true };
}
