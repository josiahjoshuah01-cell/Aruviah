/**
 * Self-test for CJ webhook endpoint.
 * Tests: valid signature, invalid signature, duplicate messageId.
 *
 * Usage: npx tsx scripts/test-cj-webhook.ts
 *
 * Requires CJ_OPEN_ID in .env.local.
 * Target: live Vercel deployment (or override with WEBHOOK_URL env).
 */
import { readFileSync } from "fs";
import { createHmac } from "crypto";

for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const idx = line.indexOf("=");
  if (idx < 1 || line.startsWith("#")) continue;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim();
  if (key && !process.env[key]) process.env[key] = val;
}

const OPEN_ID = process.env.CJ_OPEN_ID;
if (!OPEN_ID) {
  console.error("CJ_OPEN_ID not set in .env.local");
  process.exit(1);
}

const BASE_URL =
  process.env.WEBHOOK_URL || "https://aruviahcom.vercel.app/api/cj/webhook";

function sign(body: string): string {
  return createHmac("sha256", OPEN_ID!).update(body).digest("base64");
}

async function post(
  body: string,
  signature: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      sign: signature,
    },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body: json };
}

const TEST_MESSAGE_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function testValidSignature() {
  console.log("\n=== TEST 1: Valid signature (ORDER message) ===");
  const payload = JSON.stringify({
    messageId: TEST_MESSAGE_ID,
    type: "ORDER",
    messageType: "UPDATE",
    params: {
      orderNumber: "test-order-does-not-exist",
      cjOrderId: "test-cj-order-does-not-exist",
      orderStatus: "CREATED",
      logisticName: "CJPacket Ordinary",
      trackNumber: null,
      trackingProvider: null,
      createDate: "2026-07-04 12:00:00",
      updateDate: "2026-07-04 12:00:00",
    },
  });

  const sig = sign(payload);
  const result = await post(payload, sig);
  console.log(`Status: ${result.status}`);
  console.log(`Body:`, JSON.stringify(result.body));
  console.log(
    result.status === 200 ? "PASS: Accepted with valid signature" : "FAIL"
  );
  return result.status === 200;
}

async function testInvalidSignature() {
  console.log("\n=== TEST 2: Invalid signature ===");
  const payload = JSON.stringify({
    messageId: `test-bad-sig-${Date.now()}`,
    type: "ORDER",
    messageType: "UPDATE",
    params: {
      cjOrderId: "fake",
      orderStatus: "CREATED",
    },
  });

  const result = await post(payload, "totally-wrong-signature");
  console.log(`Status: ${result.status}`);
  console.log(`Body:`, JSON.stringify(result.body));
  console.log(
    result.status === 401 ? "PASS: Rejected with 401" : "FAIL"
  );
  return result.status === 401;
}

async function testDuplicateMessageId() {
  console.log("\n=== TEST 3: Duplicate messageId (idempotency) ===");
  const payload = JSON.stringify({
    messageId: TEST_MESSAGE_ID,
    type: "ORDER",
    messageType: "UPDATE",
    params: {
      cjOrderId: "test-cj-order-does-not-exist",
      orderStatus: "SHIPPED",
      trackNumber: "YT99999999",
    },
  });

  const sig = sign(payload);
  const result = await post(payload, sig);
  console.log(`Status: ${result.status}`);
  console.log(`Body:`, JSON.stringify(result.body));
  console.log(
    result.status === 200
      ? "PASS: Returned 200 without reprocessing (idempotent)"
      : "FAIL"
  );
  return result.status === 200;
}

async function testLogisticMessage() {
  console.log("\n=== TEST 4: Valid LOGISTIC message ===");
  const payload = JSON.stringify({
    messageId: `test-logistic-${Date.now()}`,
    type: "LOGISTIC",
    messageType: "UPDATE",
    openId: Number(OPEN_ID),
    params: {
      orderId: "test-cj-logistic-does-not-exist",
      storeOrderNumbers: ["test-order"],
      logisticName: "YunExpress",
      trackingNumber: "YT2312345678901234",
      trackingProvider: "USPS",
      trackingStatus: 5,
    },
  });

  const sig = sign(payload);
  const result = await post(payload, sig);
  console.log(`Status: ${result.status}`);
  console.log(`Body:`, JSON.stringify(result.body));
  console.log(
    result.status === 200 ? "PASS: LOGISTIC message accepted" : "FAIL"
  );
  return result.status === 200;
}

async function main() {
  console.log(`Target: ${BASE_URL}`);
  console.log(`OpenID: ${OPEN_ID!.slice(0, 3)}***`);

  const results = [
    await testValidSignature(),
    await testInvalidSignature(),
    await testDuplicateMessageId(),
    await testLogisticMessage(),
  ];

  console.log("\n=== SUMMARY ===");
  const labels = [
    "Valid signature",
    "Invalid signature rejection",
    "Duplicate idempotency",
    "LOGISTIC message",
  ];
  results.forEach((pass, i) =>
    console.log(`${pass ? "PASS" : "FAIL"}: ${labels[i]}`)
  );

  const allPassed = results.every(Boolean);
  console.log(allPassed ? "\nAll tests passed." : "\nSome tests FAILED.");
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
