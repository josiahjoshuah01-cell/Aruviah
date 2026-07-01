"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  useCartStore,
  selectCartSubtotal,
  selectCartShipping,
  selectCartTotalPrice,
} from "@/lib/cart-store";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variant-utils";
import { shippingSchema, type ShippingAddress } from "@/lib/validations";
import { createClient } from "@/lib/supabase/client";
import { useVariantAvailability } from "@/hooks/use-variant-availability";

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const shipping = useCartStore(selectCartShipping);
  const totalPrice = useCartStore(selectCartTotalPrice);
  const clearCart = useCartStore((s) => s.clearCart);
  const removeItem = useCartStore((s) => s.removeItem);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  const variantIds = items.map((i) => i.variantId);
  const { loaded, availability } = useVariantAvailability(variantIds, items.length > 0);
  const hasUnavailable =
    loaded &&
    items.some((item) => !availability.get(item.variantId)?.available);

  const {
    register,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<ShippingAddress>({
    resolver: zodResolver(shippingSchema),
  });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthed(!!user);
      if (!user) {
        router.push("/login?redirect=/checkout");
      }
    });
  }, [router]);

  if (isAuthed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist">
        <p className="text-muted-foreground">Loading checkout…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-mist">
        <p className="text-muted-foreground">Your cart is empty</p>
        <Button asChild>
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    );
  }

  if (loaded && hasUnavailable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-mist px-4 text-center">
        <p className="text-coral-pulse">
          Some items in your cart are no longer available.
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          A product may have been removed or deactivated. Remove unavailable
          items from your cart to continue.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {items
            .filter((item) => !availability.get(item.variantId)?.available)
            .map((item) => (
              <Button
                key={item.variantId}
                variant="outline"
                size="sm"
                onClick={() => removeItem(item.variantId)}
              >
                Remove {item.title}
              </Button>
            ))}
          <Button asChild variant="ghost">
            <Link href="/">Back to shop</Link>
          </Button>
        </div>
      </div>
    );
  }

  const cartPayload = items.map((i) => ({
    variantId: i.variantId,
    qty: i.qty,
  }));

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-border px-4 py-4 md:px-6">
        <Link href="/" className="font-display text-xl font-bold">
          Aruviah
        </Link>
      </header>
      <div className="mx-auto grid max-w-4xl gap-8 px-4 py-8 md:grid-cols-2 md:px-6">
        <div>
          <h1 className="mb-6 font-display text-2xl font-bold">Checkout</h1>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...register("firstName")} />
                {errors.firstName && (
                  <p className="text-xs text-coral-pulse">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...register("lastName")} />
                {errors.lastName && (
                  <p className="text-xs text-coral-pulse">{errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register("address")} />
              {errors.address && (
                <p className="text-xs text-coral-pulse">{errors.address.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" {...register("city")} />
                {errors.city && (
                  <p className="text-xs text-coral-pulse">{errors.city.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" {...register("country")} />
                {errors.country && (
                  <p className="text-xs text-coral-pulse">{errors.country.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} />
              {errors.phone && (
                <p className="text-xs text-coral-pulse">{errors.phone.message}</p>
              )}
            </div>
          </form>
        </div>

        <div>
          <h2 className="mb-4 font-display text-lg font-semibold">Order summary</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.variantId} className="flex gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                  {item.image && (
                    <Image src={item.image} alt={item.title} fill className="object-cover" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="line-clamp-1 text-sm">{item.title}</p>
                  {formatVariantLabel(item.color, item.size) && (
                    <p className="text-xs text-muted-foreground">
                      {formatVariantLabel(item.color, item.size)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Qty: {item.qty}</p>
                </div>
                <p className="tabular-price text-sm">
                  {formatPrice((item.price + item.shippingCost) * item.qty)}
                </p>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <div className="mb-6 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-price">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="tabular-price">
                {shipping > 0 ? formatPrice(shipping) : "—"}
              </span>
            </div>
            <div className="flex justify-between pt-1 font-medium">
              <span>Total</span>
              <span className="tabular-price text-lg">{formatPrice(totalPrice)}</span>
            </div>
          </div>

          <PayPalScriptProvider
            options={{
              clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!,
              currency: "USD",
            }}
          >
            <PayPalButtons
              style={{ layout: "vertical", shape: "rect" }}
              createOrder={async () => {
                const valid = await trigger();
                if (!valid) {
                  toast.error("Please fill in your shipping address");
                  throw new Error("Validation failed");
                }

                const shipping = getValues();
                const res = await fetch("/api/paypal/create-order", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    items: cartPayload,
                    shippingCountry: shipping.country,
                  }),
                });

                const data = await res.json();
                if (!res.ok) {
                  toast.error(data.error ?? "Failed to create order");
                  throw new Error(data.error);
                }
                return data.id;
              }}
              onApprove={async (data) => {
                const shipping = getValues();
                const res = await fetch("/api/paypal/capture", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    paypalOrderId: data.orderID,
                    items: cartPayload,
                    shipping,
                  }),
                });

                const result = await res.json();
                if (!res.ok) {
                  toast.error(result.error ?? "Payment failed");
                  return;
                }

                clearCart();
                router.push(`/success?order=${result.order_id}`);
              }}
              onError={() => {
                toast.error("PayPal encountered an error");
              }}
            />
          </PayPalScriptProvider>
        </div>
      </div>
    </div>
  );
}
