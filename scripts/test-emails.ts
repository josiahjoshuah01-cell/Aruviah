/**
 * Test script: sends both email templates via Resend.
 *
 * Usage:
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/test-emails.ts [recipient@example.com]
 *
 * If no recipient is given, it sends to the ADMIN_EMAIL from .env.local
 * (which should be the Resend account email in sandbox/unverified mode).
 */
import { Resend } from "resend";
import {
  buildOrderConfirmationHtml,
  buildShippedHtml,
} from "../lib/email-templates";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error("RESEND_API_KEY is not set in .env.local");
  process.exit(1);
}

const recipient =
  process.argv[2] || process.env.ADMIN_EMAIL || "test@example.com";
const from =
  process.env.EMAIL_FROM_ADDRESS || "Aruviah <onboarding@resend.dev>";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://aruviahcom.vercel.app";

const resend = new Resend(RESEND_API_KEY);

async function testOrderConfirmation() {
  console.log(`\n--- Sending Order Confirmation to ${recipient} ---`);

  const html = buildOrderConfirmationHtml({
    orderId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    orderDate: new Date().toISOString(),
    items: [
      { title: "Wireless Earbuds Pro", variant: "Black", qty: 1, price: 49.99 },
      {
        title: "USB-C Fast Charger 20W",
        variant: null,
        qty: 2,
        price: 12.99,
      },
      {
        title: "Fleece-Lined Casual Hoodie Set",
        variant: "Grey / XL",
        qty: 1,
        price: 45.5,
      },
    ],
    subtotal: 121.47,
    shippingTotal: 4.99,
    total: 126.46,
    shipping: {
      firstName: "Jane",
      lastName: "Doe",
      address: "123 Test Street, Apt 4B",
      city: "Austin",
      zip: "78701",
      country: "US",
    },
    siteUrl,
  });

  const { data, error } = await resend.emails.send({
    from,
    to: recipient,
    subject: "TEST — Order confirmed — A1B2C3D4",
    html,
  });

  if (error) {
    console.error("Failed:", error);
  } else {
    console.log("Sent! ID:", data?.id);
  }
}

async function testShippedNotification() {
  console.log(`\n--- Sending Shipped Notification to ${recipient} ---`);

  const html = buildShippedHtml({
    orderId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    carrier: "YunExpress",
    trackNumber: "YT2312345678901234",
    trackingUrl: "https://www.17track.net/en/track?nums=YT2312345678901234",
    estimatedDelivery: "July 18 – July 25, 2026",
    siteUrl,
  });

  const { data, error } = await resend.emails.send({
    from,
    to: recipient,
    subject: "TEST — Your order has shipped — A1B2C3D4",
    html,
  });

  if (error) {
    console.error("Failed:", error);
  } else {
    console.log("Sent! ID:", data?.id);
  }
}

async function main() {
  await testOrderConfirmation();
  await testShippedNotification();
  console.log("\nDone.");
}

main().catch(console.error);
