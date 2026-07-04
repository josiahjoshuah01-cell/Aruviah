"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  useCartStore,
  selectCartSubtotal,
} from "@/lib/cart-store";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variant-utils";
import { shippingSchema, type ShippingAddress } from "@/lib/validations";
import { createClient } from "@/lib/supabase/client";
import { useVariantAvailability } from "@/hooks/use-variant-availability";

type ShippingQuote = {
  subtotal: number;
  shippingTotal: number;
  total: number;
  destinationCountryCode: string;
};

type UnshippableItem = {
  variantId: string;
  title: string;
  destinationCountry: string;
};

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const clearCart = useCartStore((s) => s.clearCart);
  const removeItem = useCartStore((s) => s.removeItem);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [unshippableItems, setUnshippableItems] = useState<UnshippableItem[]>(
    []
  );
  const [shippingError, setShippingError] = useState<string | null>(null);
  const calcRequestId = useRef(0);

  const variantIds = items.map((i) => i.variantId);
  const { loaded, availability } = useVariantAvailability(variantIds, items.length > 0);
  const hasUnavailable =
    loaded &&
    items.some((item) => !availability.get(item.variantId)?.available);

  const {
    register,
    getValues,
    trigger,
    control,
    formState: { errors },
  } = useForm<ShippingAddress>({
    resolver: zodResolver(shippingSchema),
  });

  const watchedDestination = useWatch({
    control,
    name: ["country", "city", "zip"],
  });

  const cartPayload = items.map((i) => ({
    variantId: i.variantId,
    qty: i.qty,
  }));

  const fetchShippingQuote = useCallback(async () => {
    const valid = await trigger(["country", "city", "zip"]);
    if (!valid || items.length === 0) {
      setShippingQuote(null);
      setUnshippableItems([]);
      setShippingError(null);
      return;
    }

    const destination = {
      country: getValues("country"),
      city: getValues("city"),
      zip: getValues("zip"),
    };

    const payload = items.map((i) => ({
      variantId: i.variantId,
      qty: i.qty,
    }));

    const requestId = ++calcRequestId.current;
    setShippingLoading(true);
    setShippingError(null);
    setUnshippableItems([]);

    try {
      const res = await fetch("/api/checkout/calculate-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload, destination }),
      });

      const data = await res.json();
      if (requestId !== calcRequestId.current) return;

      if (!res.ok) {
        setShippingQuote(null);
        setShippingError(data.error ?? "Could not calculate shipping");
        if (Array.isArray(data.unshippableItems)) {
          setUnshippableItems(
            data.unshippableItems.map(
              (item: {
                variantId: string;
                title: string;
                destinationCountry: string;
              }) => ({
                variantId: item.variantId,
                title: item.title,
                destinationCountry: item.destinationCountry,
              })
            )
          );
        }
        return;
      }

      setShippingQuote({
        subtotal: data.subtotal,
        shippingTotal: data.shippingTotal,
        total: data.total,
        destinationCountryCode: data.destinationCountryCode,
      });
    } catch {
      if (requestId !== calcRequestId.current) return;
      setShippingQuote(null);
      setShippingError("Failed to calculate shipping");
    } finally {
      if (requestId === calcRequestId.current) {
        setShippingLoading(false);
      }
    }
  }, [getValues, items, trigger]);

  useEffect(() => {
    const [country, city, zip] = watchedDestination ?? [];
    if (!country || country.length < 2 || !city || city.length < 2 || !zip || zip.length < 2) {
      setShippingQuote(null);
      setUnshippableItems([]);
      setShippingError(null);
      return;
    }

    const timer = setTimeout(() => {
      void fetchShippingQuote();
    }, 500);

    return () => clearTimeout(timer);
  }, [watchedDestination, fetchShippingQuote]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthed(!!user);
      if (!user) {
        router.push("/login?redirect=/checkout");
      }
    });
  }, [router]);

  const canPay =
    !!shippingQuote &&
    !shippingLoading &&
    !shippingError &&
    unshippableItems.length === 0;

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

  const displaySubtotal = shippingQuote?.subtotal ?? subtotal;
  const displayShipping = shippingQuote?.shippingTotal ?? null;
  const displayTotal =
    shippingQuote?.total ?? (shippingQuote ? null : subtotal);

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
                <Label htmlFor="zip">Zip / postal code</Label>
                <Input id="zip" {...register("zip")} />
                {errors.zip && (
                  <p className="text-xs text-coral-pulse">{errors.zip.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" placeholder="US or United States" {...register("country")} />
              {errors.country && (
                <p className="text-xs text-coral-pulse">{errors.country.message}</p>
              )}
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
            {items.map((item) => {
              const blocked = unshippableItems.find(
                (u) => u.variantId === item.variantId
              );
              return (
                <div key={item.variantId}>
                  <div className="flex gap-3">
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
                      {formatPrice(item.price * item.qty)}
                    </p>
                  </div>
                  {blocked && (
                    <p className="mt-1 text-xs text-coral-pulse">
                      This item can&apos;t ship to {blocked.destinationCountry}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <Separator className="my-4" />
          <div className="mb-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-price">{formatPrice(displaySubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="tabular-price">
                {shippingLoading
                  ? "Calculating shipping…"
                  : displayShipping != null
                    ? formatPrice(displayShipping)
                    : "—"}
              </span>
            </div>
            <div className="flex justify-between pt-1 font-medium">
              <span>Total</span>
              <span className="tabular-price text-lg">
                {shippingLoading
                  ? "—"
                  : displayTotal != null
                    ? formatPrice(displayTotal)
                    : "—"}
              </span>
            </div>
          </div>

          {shippingError && unshippableItems.length === 0 && (
            <p className="mb-4 text-sm text-coral-pulse">{shippingError}</p>
          )}

          {!canPay && !shippingLoading && (
            <p className="mb-4 text-xs text-muted-foreground">
              Enter your shipping address (country, city, and zip) to calculate
              shipping and enable payment.
            </p>
          )}

          <p className="mb-4 text-xs text-muted-foreground">
            By placing this order, you agree to our{" "}
            <Link
              href="/legal/terms"
              className="text-stream underline underline-offset-2 hover:text-stream/80"
              target="_blank"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/legal/privacy"
              className="text-stream underline underline-offset-2 hover:text-stream/80"
              target="_blank"
            >
              Privacy Policy
            </Link>
            .
          </p>

          <div className={canPay ? "" : "pointer-events-none opacity-50"}>
            <PayPalScriptProvider
              options={{
                clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!,
                currency: "USD",
              }}
            >
              <PayPalButtons
                style={{ layout: "vertical", shape: "rect" }}
                disabled={!canPay}
                createOrder={async () => {
                  const valid = await trigger();
                  if (!valid) {
                    toast.error("Please fill in your shipping address");
                    throw new Error("Validation failed");
                  }
                  if (!shippingQuote) {
                    toast.error("Shipping has not been calculated yet");
                    throw new Error("Shipping not calculated");
                  }

                  const address = getValues();
                  const res = await fetch("/api/paypal/create-order", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      items: cartPayload,
                      shippingCountry: address.country,
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
                  const address = getValues();
                  const res = await fetch("/api/paypal/capture", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      paypalOrderId: data.orderID,
                      items: cartPayload,
                      shipping: address,
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
    </div>
  );
}
