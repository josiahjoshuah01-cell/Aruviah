import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify CJ webhook signature.
 *
 * CJ signs: sign = Base64(HmacSHA256(secret = openId string, message = raw body)).
 * The `sign` value is sent as an HTTP header.
 *
 * IMPORTANT: `rawBody` must be the exact bytes received — never re-serialized JSON.
 */
export function verifyCjWebhookSignature(
  rawBody: string,
  signatureHeader: string
): boolean {
  const openId = process.env.CJ_OPEN_ID;
  if (!openId) {
    console.error("[cj-webhook] CJ_OPEN_ID not configured");
    return false;
  }

  const computed = createHmac("sha256", openId)
    .update(rawBody)
    .digest("base64");

  try {
    const a = Buffer.from(computed, "utf-8");
    const b = Buffer.from(signatureHeader, "utf-8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
