import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCartItems, savePendingCheckout } from "@/lib/orders";
import { createPayPalOrder, getPayPalAccessToken } from "@/lib/paypal";
import { createOrderSchema, rejectsClientPricing } from "@/lib/validations";

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

    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const resolved = await resolveCartItems(
      parsed.data.items,
      parsed.data.shippingCountry
    );
    if ("error" in resolved) {
      return NextResponse.json(
        {
          error: resolved.error,
          unshippableItems: resolved.unshippableItems,
        },
        { status: 400 }
      );
    }

    const accessToken = await getPayPalAccessToken();
    const paypalOrderId = await createPayPalOrder(
      accessToken,
      resolved.total
    );

    await savePendingCheckout({
      paypalOrderId,
      userId: user.id,
      items: parsed.data.items,
      shippingCountry: parsed.data.shippingCountry,
      quote: {
        subtotal: resolved.subtotal,
        shippingTotal: resolved.shippingTotal,
        total: resolved.total,
      },
    });

    return NextResponse.json({ id: paypalOrderId });
  } catch (err) {
    console.error("[create-order]", err);
    return NextResponse.json(
      { error: "Failed to create PayPal order" },
      { status: 500 }
    );
  }
}
