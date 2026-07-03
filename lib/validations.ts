import { z } from "zod";

export const catalogSortSchema = z.enum([
  "price-asc",
  "price-desc",
  "newest",
  "bestselling",
]);

export const searchParamsSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  size: z.string().optional(),
  minPrice: z
    .preprocess(
      (val) => (val === "" || val === undefined ? undefined : val),
      z.coerce.number().nonnegative().optional()
    ),
  maxPrice: z
    .preprocess(
      (val) => (val === "" || val === undefined ? undefined : val),
      z.coerce.number().nonnegative().optional()
    ),
  sort: catalogSortSchema.optional(),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
  categorySlugFromPath?: string
): SearchParams & { category?: string } {
  const raw = {
    q: typeof params.q === "string" ? params.q : undefined,
    category:
      categorySlugFromPath ??
      (typeof params.category === "string" ? params.category : undefined),
    size: typeof params.size === "string" ? params.size : undefined,
    minPrice:
      typeof params.minPrice === "string" ? params.minPrice : undefined,
    maxPrice:
      typeof params.maxPrice === "string" ? params.maxPrice : undefined,
    sort: typeof params.sort === "string" ? params.sort : undefined,
  };
  return searchParamsSchema.parse(raw);
}

export function countActiveFilters(
  params: SearchParams & { category?: string },
  options?: { ignoreCategory?: boolean }
): number {
  let count = 0;
  if (params.size) count++;
  if (params.minPrice != null) count++;
  if (params.maxPrice != null) count++;
  if (params.sort) count++;
  if (!options?.ignoreCategory && params.category) count++;
  return count;
}

export const reviewSchema = z.object({
  productId: z.string().uuid(),
  orderId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export const shippingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  address: z.string().min(5, "Address is required"),
  city: z.string().min(2, "City is required"),
  zip: z.string().min(2, "Zip/postal code is required"),
  country: z.string().min(2, "Country is required"),
  phone: z.string().min(7, "Phone number is required"),
});

export type ShippingAddress = z.infer<typeof shippingSchema>;

export const cartItemInputSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
});

export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const shippingDestinationSchema = z.object({
  country: z.string().min(2, "Country is required"),
  city: z.string().min(2, "City is required"),
  zip: z.string().min(2, "Zip/postal code is required"),
});

export const calculateShippingSchema = z
  .object({
    items: z.array(cartItemInputSchema).min(1),
    destination: shippingDestinationSchema,
  })
  .strict();

export const createOrderSchema = z
  .object({
    items: z.array(cartItemInputSchema).min(1),
    shippingCountry: z.string().min(2, "Shipping country is required"),
  })
  .strict();

export const captureOrderSchema = z
  .object({
    paypalOrderId: z.string().min(1),
    items: z.array(cartItemInputSchema).min(1),
    shipping: shippingSchema,
  })
  .strict();

/** Reject client-sent price fields before schema parse. */
export function rejectsClientPricing(body: Record<string, unknown>): boolean {
  return "total" in body || "amount" in body;
}
