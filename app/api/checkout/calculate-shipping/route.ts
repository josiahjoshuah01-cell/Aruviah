import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateCheckoutShipping } from "@/lib/checkout-shipping";
import {
  calculateShippingSchema,
  rejectsClientPricing,
} from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (rejectsClientPricing(body)) {
      return NextResponse.json(
        { error: "Client must not send total or amount" },
        { status: 400 }
      );
    }

    const parsed = calculateShippingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await calculateCheckoutShipping(
      parsed.data.items,
      parsed.data.destination.country
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          unshippableItems: result.unshippableItems,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      subtotal: result.quote.subtotal,
      shippingTotal: result.quote.shippingTotal,
      total: result.quote.total,
      destinationCountryCode: result.quote.destinationCountryCode,
      groups: result.quote.groups,
    });
  } catch (err) {
    console.error("[calculate-shipping]", err);
    return NextResponse.json(
      { error: "Failed to calculate shipping" },
      { status: 500 }
    );
  }
}
