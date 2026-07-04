/*
 * IMPORTANT — DRAFT LEGAL CONTENT
 * This is template content for the business owner to review with a lawyer
 * before treating as final. In particular:
 * - The "Governing Law" section contains a placeholder that MUST be filled
 *   in with your real jurisdiction before this is legally meaningful.
 * - The contact email should be updated if support@aruviah.com is not yet active.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms and conditions for using Aruviah.",
};

export default function TermsOfServicePage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: July 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using the Aruviah website (&ldquo;Site&rdquo;), you
        agree to be bound by these Terms of Service. If you do not agree, please
        do not use the Site.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        Aruviah is an online retail store. Products listed on the Site are
        fulfilled by third-party dropship suppliers and are not held in
        Aruviah&rsquo;s own inventory. When you place an order, we coordinate
        with our fulfillment partners to have items shipped directly to you.
      </p>

      <h2>3. Account Registration</h2>
      <p>
        You may create an account to place orders, track shipments, and leave
        reviews. You are responsible for maintaining the confidentiality of your
        account credentials and for all activity that occurs under your account.
        You agree to provide accurate, current information during registration
        and to update it as needed.
      </p>

      <h2>4. Orders and Pricing</h2>
      <ul>
        <li>All prices are listed in US dollars (USD).</li>
        <li>
          We reserve the right to correct pricing or listing errors at any time
          before an order has shipped. If a significant error is identified after
          payment but before shipment, we will notify you and offer the option to
          proceed at the corrected price or receive a full refund.
        </li>
        <li>
          An order is considered confirmed once payment has been successfully
          captured.
        </li>
      </ul>

      <h2>5. Payment</h2>
      <p>
        Payments are currently processed exclusively through PayPal. By placing
        an order, you agree to PayPal&rsquo;s{" "}
        <a
          href="https://www.paypal.com/us/legalhub/useragreement-full"
          target="_blank"
          rel="noopener noreferrer"
        >
          User Agreement
        </a>
        . We do not store or have access to your PayPal login credentials or
        financial account details.
      </p>

      <h2>6. Product Descriptions</h2>
      <p>
        Product descriptions, images, and specifications are sourced from our
        third-party suppliers. While we make every effort to ensure accuracy,
        minor variations in color, packaging, or dimensions may occur between
        what is displayed on the Site and the physical product you receive.
      </p>

      <h2>7. Shipping and Returns</h2>
      <p>
        Shipping timelines, return conditions, and refund procedures are
        described in our{" "}
        <Link href="/legal/shipping-returns">Shipping &amp; Returns Policy</Link>
        , which forms part of these Terms.
      </p>

      <h2>8. Prohibited Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Use the Site for any unlawful purpose or in violation of any applicable
          laws or regulations.
        </li>
        <li>
          Attempt to interfere with the operation of the Site, including by
          introducing malware, scraping content at scale, or circumventing
          security measures.
        </li>
        <li>
          Impersonate any person or entity, or misrepresent your affiliation with
          any person or entity.
        </li>
        <li>
          Use automated tools to access the Site in a manner that places
          unreasonable load on our infrastructure.
        </li>
      </ul>

      <h2>9. Intellectual Property</h2>
      <p>
        The Aruviah name, logo, site design, and original content are the
        property of Aruviah or its licensors. Product images and descriptions
        remain the property of their respective suppliers and rights holders. You
        may not reproduce, distribute, or create derivative works from Site
        content without written permission.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by applicable law, Aruviah shall not be
        liable for any indirect, incidental, special, consequential, or punitive
        damages arising from your use of the Site, including but not limited to
        damages for loss of profits, data, or goodwill. Our total liability for
        any claim arising from a purchase shall not exceed the amount you paid
        for the specific order giving rise to the claim.
      </p>

      <h2>11. Disclaimer of Warranties</h2>
      <p>
        The Site and all products are provided &ldquo;as is&rdquo; and
        &ldquo;as available&rdquo; without warranties of any kind, whether
        express or implied, including but not limited to implied warranties of
        merchantability, fitness for a particular purpose, or non-infringement.
      </p>

      {/* TODO: OWNER MUST FILL IN — Replace the placeholder below with your
          actual governing jurisdiction (e.g. "the State of Texas, United States"
          or "the laws of England and Wales"). This section is not legally
          meaningful until a real jurisdiction is specified. */}
      <h2>12. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the
        laws of{" "}
        <strong>[Governing law/jurisdiction to be specified]</strong>. Any
        disputes arising under these Terms shall be resolved in the courts of
        that jurisdiction.
      </p>

      <h2>13. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Changes will be posted on
        this page with an updated &ldquo;Last updated&rdquo; date. Continued use
        of the Site after changes are posted constitutes acceptance of the
        revised Terms.
      </p>

      <h2>14. Contact</h2>
      <p>
        If you have questions about these Terms, please contact us at{" "}
        <a href="mailto:support@aruviah.com">support@aruviah.com</a>.
      </p>
    </>
  );
}
