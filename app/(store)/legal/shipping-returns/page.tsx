import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shipping & Returns",
  description:
    "Aruviah shipping timelines, return conditions, and refund procedures.",
};

export default function ShippingReturnsPage() {
  return (
    <>
      <h1>Shipping &amp; Returns</h1>
      <p className="text-muted-foreground">Last updated: July 2026</p>

      <h2>Shipping</h2>

      <h2>Where We Ship</h2>
      <p>
        Aruviah ships internationally. Available shipping destinations and costs
        are calculated at checkout based on the items in your cart and your
        delivery address.
      </p>

      <h2>Delivery Estimates</h2>
      <p>
        Delivery times vary by product. Items ship from either US-based or
        international warehouses (primarily China) depending on the specific
        product and its availability. Estimated delivery windows are displayed on
        each product page and during checkout.
      </p>
      <p>
        Typical delivery estimates range from 3–7 business days for US-warehouse
        items and 7–20 business days for items shipping from international
        warehouses. These are estimates, not guarantees — actual delivery times
        may be affected by customs processing, carrier delays, or local
        conditions.
      </p>

      <h2>Order Tracking</h2>
      <p>
        Once your order has shipped, a tracking number will be provided when
        available. You can view your tracking information in your{" "}
        <Link href="/account/orders">Orders</Link> page after signing in to your
        account.
      </p>

      <h2>Shipping Costs</h2>
      <p>
        Shipping costs are calculated at checkout based on the destination
        country and the items in your order. The shipping total is displayed
        before payment so you can review it before completing your purchase.
      </p>

      <hr className="my-8 border-border" />

      <h2>Returns &amp; Refunds</h2>

      <h2>Order Cancellation</h2>
      <p>
        Orders may be cancelled only before fulfillment has been dispatched to
        our shipping partner. Once processing has begun, cancellation may not be
        possible. If you need to cancel an order, please contact us immediately
        at{" "}
        <a href="mailto:support@aruviah.com">support@aruviah.com</a> with your
        order number.
      </p>

      <h2>Damaged, Lost, or Incorrect Items</h2>
      <p>
        If you receive a damaged, defective, or incorrect item, please contact
        us at{" "}
        <a href="mailto:support@aruviah.com">support@aruviah.com</a> within 14
        days of delivery with:
      </p>
      <ul>
        <li>Your order number</li>
        <li>
          A description of the issue and photos of the damaged or incorrect
          item(s)
        </li>
      </ul>
      <p>
        We will investigate the issue and coordinate with our fulfillment
        partner on your behalf. Resolution will be a refund or replacement
        depending on the specific circumstances and product availability.
      </p>

      <h2>Return Conditions</h2>
      <p>To be eligible for a return:</p>
      <ul>
        <li>
          Contact us within 14 days of receiving your delivery to initiate the
          process.
        </li>
        <li>
          Items must be unused, in their original packaging, and in the same
          condition as received.
        </li>
        <li>
          Certain items may not be eligible for return for hygiene or safety
          reasons (e.g. personal care products, undergarments). These
          restrictions will be noted on the product page where applicable.
        </li>
      </ul>

      <h2>Refund Processing</h2>
      <p>
        Approved refunds are processed back to your original PayPal payment
        method. Please allow 5–10 business days for the refund to appear in
        your account after approval. You will receive an email confirmation when
        your refund has been issued.
      </p>

      <h2>Late or Missing Refunds</h2>
      <p>
        If you have not received your refund after 10 business days, please
        check your PayPal account first, then contact PayPal support. If the
        issue remains unresolved, contact us at{" "}
        <a href="mailto:support@aruviah.com">support@aruviah.com</a>.
      </p>

      <h2>Contact</h2>
      <p>
        For all shipping and returns inquiries, email us at{" "}
        <a href="mailto:support@aruviah.com">support@aruviah.com</a> with your
        order number and a description of your issue. We aim to respond within
        1–2 business days.
      </p>

      <p className="mt-6 text-xs text-muted-foreground">
        See also: <Link href="/legal/terms">Terms of Service</Link> ·{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>
      </p>
    </>
  );
}
