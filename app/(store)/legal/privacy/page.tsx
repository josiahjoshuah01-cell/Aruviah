import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Aruviah collects, uses, and protects your information.",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: July 2026</p>

      <h2>1. Information We Collect</h2>
      <p>We collect the following information when you use Aruviah:</p>
      <ul>
        <li>
          <strong>Account information:</strong> email address and password when
          you create an account (managed through our authentication provider,
          Supabase).
        </li>
        <li>
          <strong>Checkout information:</strong> full name, shipping address,
          city, state/province, postal code, country, and phone number — provided
          at checkout to fulfill your order.
        </li>
        <li>
          <strong>Order history:</strong> records of your purchases, including
          items, quantities, prices, and shipping details.
        </li>
        <li>
          <strong>Client-side data:</strong> your shopping cart contents and
          theme preference (light/dark mode) are stored locally in your browser
          and are not transmitted to our servers beyond what is needed to
          complete a purchase.
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>
          <strong>Order fulfillment:</strong> processing and shipping your
          orders, including communicating your shipping details to our
          fulfillment partners.
        </li>
        <li>
          <strong>Order communication:</strong> sending order confirmations,
          shipping updates, and responding to support inquiries.
        </li>
        <li>
          <strong>Account management:</strong> maintaining your account,
          displaying your order history, and enabling product reviews.
        </li>
      </ul>

      <h2>3. Third Parties We Share Data With</h2>
      <p>
        We share your information with the following third-party services, only
        to the extent necessary for the stated purposes:
      </p>
      <ul>
        <li>
          <strong>PayPal:</strong> processes your payment. PayPal receives your
          order total and payment authorization. We do not receive or store your
          PayPal login credentials or financial account details.
        </li>
        <li>
          <strong>CJ Dropshipping:</strong> our primary fulfillment partner.
          They receive your shipping name, address, and phone number to pick,
          pack, and ship your order. Some items may be fulfilled from warehouses
          located in China or other international locations.
        </li>
        <li>
          <strong>Supabase:</strong> provides our database and authentication
          infrastructure. Your account email, hashed password, and order data are
          stored in Supabase-managed infrastructure.
        </li>
        <li>
          <strong>Vercel:</strong> hosts the Aruviah website. Vercel processes
          your web requests and may collect standard server logs (IP address,
          browser type, pages visited).
        </li>
      </ul>

      <h2>4. International Data Transfers</h2>
      <p>
        As part of order fulfillment, your shipping information (name, address,
        phone number) may be transferred to fulfillment warehouses located
        outside your home country, including but not limited to China. This
        transfer is necessary to deliver your order and occurs only with the
        fulfillment partners named above.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We retain your account information and order history for as long as your
        account is active or as needed to provide you with our services, comply
        with legal obligations, resolve disputes, and enforce our agreements.
      </p>

      <h2>6. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you.</li>
        <li>
          Request correction of inaccurate information in your account.
        </li>
        <li>
          Request deletion of your account and associated data.
        </li>
      </ul>
      <p>
        Automated self-service account deletion is not yet available. To
        exercise any of these rights, please contact us at{" "}
        <a href="mailto:support@aruviah.com">support@aruviah.com</a> and we
        will process your request within a reasonable timeframe.
      </p>

      <h2>7. Children&rsquo;s Privacy</h2>
      <p>
        Aruviah is not directed at children under the age of 13. We do not
        knowingly collect personal information from children under 13. If you
        believe a child under 13 has provided us with personal information,
        please contact us and we will take steps to delete it.
      </p>

      <h2>8. Cookies and Local Storage</h2>
      <p>
        We use essential cookies for authentication sessions. Your cart contents
        and theme preference are stored in your browser&rsquo;s local storage.
        We do not use third-party advertising or tracking cookies.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Changes will be
        posted on this page with an updated &ldquo;Last updated&rdquo; date.
        Continued use of the Site after changes are posted constitutes
        acceptance of the revised policy.
      </p>

      <h2>10. Contact</h2>
      <p>
        If you have questions about this Privacy Policy or how your data is
        handled, please contact us at{" "}
        <a href="mailto:support@aruviah.com">support@aruviah.com</a>.
      </p>

      <p className="mt-6 text-xs text-muted-foreground">
        See also: <Link href="/legal/terms">Terms of Service</Link> ·{" "}
        <Link href="/legal/shipping-returns">Shipping &amp; Returns</Link>
      </p>
    </>
  );
}
