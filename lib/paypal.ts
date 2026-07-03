const PAYPAL_API_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function createPayPalOrder(
  accessToken: string,
  total: number
): Promise<string> {
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: total.toFixed(2),
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal create order failed: ${err}`);
  }

  const data = await res.json();
  return data.id;
}

export async function capturePayPalOrder(
  accessToken: string,
  orderId: string
): Promise<{ status: string; id: string; amountUsd: number }> {
  const res = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal capture failed: ${err}`);
  }

  const data = await res.json();
  const rawAmount =
    data?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ??
    data?.purchase_units?.[0]?.amount?.value;
  const amountUsd =
    rawAmount != null ? parseFloat(String(rawAmount)) : Number.NaN;

  return { status: data.status, id: data.id, amountUsd };
}

export async function getPayPalOrderAmount(
  accessToken: string,
  orderId: string
): Promise<number | null> {
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const value = data?.purchase_units?.[0]?.amount?.value;
  return value != null ? parseFloat(String(value)) : null;
}

export async function verifyPayPalWebhook(
  headers: Headers,
  body: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("[PayPal] PAYPAL_WEBHOOK_ID is not configured");
    return false;
  }

  const accessToken = await getPayPalAccessToken();

  const res = await fetch(
    `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    }
  );

  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === "SUCCESS";
}

/** Extract PayPal checkout order ID from PAYMENT.CAPTURE.COMPLETED webhook payload. */
export function extractPayPalOrderIdFromWebhook(event: {
  event_type?: string;
  resource?: {
    id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}): string | null {
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return null;
  }
  return event.resource?.supplementary_data?.related_ids?.order_id ?? null;
}
