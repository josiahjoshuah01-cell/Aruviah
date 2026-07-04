import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  buildOrderConfirmationHtml,
  buildShippedHtml,
} from "@/lib/email-templates";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send");
    return null;
  }
  return new Resend(key);
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS || "Aruviah <onboarding@resend.dev>";
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://aruviahcom.vercel.app"
  );
}

type OrderLineItem = {
  title: string;
  variant?: string | null;
  qty: number;
  price: number;
};

type ShippingAddr = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  country: string;
};

/**
 * Send order confirmation email. Never throws — logs on failure.
 * Returns true if sent, false otherwise.
 */
export async function sendOrderConfirmationEmail(params: {
  orderId: string;
  userEmail: string;
  orderDate: string;
  items: OrderLineItem[];
  subtotal: number;
  shippingTotal: number;
  total: number;
  shipping: ShippingAddr;
}): Promise<boolean> {
  try {
    const resend = getResend();
    if (!resend) return false;

    const html = buildOrderConfirmationHtml({
      ...params,
      siteUrl: getSiteUrl(),
    });

    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: params.userEmail,
      subject: `Order confirmed — ${params.orderId.slice(0, 8).toUpperCase()}`,
      html,
    });

    if (error) {
      console.error("[email] Resend error (order confirmation):", error);
      return false;
    }

    console.log(
      `[email] Order confirmation sent to ${params.userEmail} for ${params.orderId}`
    );
    return true;
  } catch (err) {
    console.error("[email] Failed to send order confirmation:", err);
    return false;
  }
}

/**
 * Send shipped notification email. Never throws — logs on failure.
 * Returns true if sent, false otherwise.
 */
export async function sendShippedEmail(params: {
  orderId: string;
  userEmail: string;
  carrier: string | null;
  trackNumber: string | null;
  trackingUrl: string | null;
  estimatedDelivery?: string | null;
}): Promise<boolean> {
  try {
    const resend = getResend();
    if (!resend) return false;

    const html = buildShippedHtml({
      ...params,
      siteUrl: getSiteUrl(),
    });

    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: params.userEmail,
      subject: `Your order has shipped — ${params.orderId.slice(0, 8).toUpperCase()}`,
      html,
    });

    if (error) {
      console.error("[email] Resend error (shipped):", error);
      return false;
    }

    console.log(
      `[email] Shipped notification sent to ${params.userEmail} for ${params.orderId}`
    );
    return true;
  } catch (err) {
    console.error("[email] Failed to send shipped notification:", err);
    return false;
  }
}

/**
 * After a successful order creation, fetch line items and send the receipt.
 * Sets confirmation_email_sent_at for idempotency. Never throws.
 */
export async function trySendOrderConfirmation(
  orderId: string,
  userId: string
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, total, shipping, created_at, confirmation_email_sent_at")
      .eq("id", orderId)
      .single();

    if (!order) return;
    if (order.confirmation_email_sent_at) return;

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) return;

    const { data: items } = await supabase
      .from("order_items")
      .select(
        "qty, price, variant:product_variants(product:products(title), color, size)"
      )
      .eq("order_id", orderId);

    if (!items || items.length === 0) return;

    const shipping = order.shipping as ShippingAddr | null;
    if (!shipping) return;

    const lineItems: OrderLineItem[] = items.map((item) => {
      const variant = Array.isArray(item.variant)
        ? item.variant[0]
        : item.variant;
      const product = Array.isArray(variant?.product)
        ? variant.product[0]
        : variant?.product;

      const parts: string[] = [];
      if (variant?.color) parts.push(variant.color);
      if (variant?.size) parts.push(variant.size);

      return {
        title: product?.title ?? "Product",
        variant: parts.length > 0 ? parts.join(" / ") : null,
        qty: item.qty,
        price: Number(item.price),
      };
    });

    const subtotal = lineItems.reduce((s, i) => s + i.price * i.qty, 0);
    const total = Number(order.total);
    const shippingTotal = Math.max(0, total - subtotal);

    const sent = await sendOrderConfirmationEmail({
      orderId,
      userEmail: email,
      orderDate: order.created_at,
      items: lineItems,
      subtotal,
      shippingTotal,
      total,
      shipping,
    });

    if (sent) {
      await supabase
        .from("orders")
        .update({ confirmation_email_sent_at: new Date().toISOString() })
        .eq("id", orderId);
    }
  } catch (err) {
    console.error("[email] trySendOrderConfirmation error:", err);
  }
}
