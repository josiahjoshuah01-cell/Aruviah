import { NextResponse } from "next/server";
import {
  fulfillOrderFromWebhook,
  getExistingOrderByPaypalId,
} from "@/lib/orders";
import {
  extractPayPalOrderIdFromWebhook,
  verifyPayPalWebhook,
} from "@/lib/paypal";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const headers = request.headers;

    const isValid = await verifyPayPalWebhook(headers, body);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);

    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const paypalOrderId = extractPayPalOrderIdFromWebhook(event);
    if (!paypalOrderId) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const existingOrderId = await getExistingOrderByPaypalId(paypalOrderId);
    if (existingOrderId) {
      return NextResponse.json(
        { received: true, order_id: existingOrderId },
        { status: 200 }
      );
    }

    const result = await fulfillOrderFromWebhook(paypalOrderId);

    if ("skipped" in result) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if ("error" in result) {
      console.error("[webhook] fulfill failed:", result.error);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    return NextResponse.json(
      { received: true, order_id: result.orderId },
      { status: 200 }
    );
  } catch (err) {
    console.error("[webhook]", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
