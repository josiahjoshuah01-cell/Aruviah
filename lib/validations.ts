import { z } from "zod";

export const searchParamsSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

export function parseSearchParams(
  params: Record<string, string | string[] | undefined>
): SearchParams {
  const raw = {
    q: typeof params.q === "string" ? params.q : undefined,
    category:
      typeof params.category === "string" ? params.category : undefined,
  };
  return searchParamsSchema.parse(raw);
}

export const shippingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  address: z.string().min(5, "Address is required"),
  city: z.string().min(2, "City is required"),
  country: z.string().min(2, "Country is required"),
  phone: z.string().min(7, "Phone number is required"),
});

export type ShippingAddress = z.infer<typeof shippingSchema>;

export const cartItemInputSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().positive(),
});

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

export type CartItemInput = z.infer<typeof cartItemInputSchema>;

/** Reject client-sent price fields before schema parse. */
export function rejectsClientPricing(body: Record<string, unknown>): boolean {
  return "total" in body || "amount" in body;
}
