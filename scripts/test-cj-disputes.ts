/**
 * Dry-run / live test for CJ dispute API against sandbox order SD26070202192406477001.
 *
 * Usage:
 *   npx tsx scripts/test-cj-disputes.ts           # steps 1–2 only (no create)
 *   npx tsx scripts/test-cj-disputes.ts --create  # full flow (files a real dispute)
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const SANDBOX_ORDER_ID = "SD26070202192406477001";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvLocal();
  process.env.CJ_SANDBOX_MODE = "true";

  const doCreate = process.argv.includes("--create");

  const {
    getDisputeEligibleProducts,
    getDisputeConfirmInfo,
    createDispute,
    getDisputeList,
    buildBusinessDisputeId,
  } = await import("../lib/cj-disputes");

  console.log(`\n=== Step 1: disputeProducts (${SANDBOX_ORDER_ID}) ===`);
  await sleep(1200);
  const products = await getDisputeEligibleProducts(SANDBOX_ORDER_ID);
  if (!products.ok) {
    console.error("FAILED:", products.error);
    process.exit(1);
  }
  console.log(JSON.stringify(products.data, null, 2));

  const eligible = products.data.productInfoList.filter((p) => p.canChoose);
  if (!eligible.length) {
    console.log(
      "\nNo eligible line items (order may need delivery or items already disputed). Stopping before confirm."
    );
    process.exit(0);
  }

  const productInfoList = eligible.slice(0, 1).map((p) => ({
    lineItemId: p.lineItemId,
    quantity: p.quantity,
    price: p.price,
  }));

  console.log("\n=== Step 2: disputeConfirmInfo ===");
  await sleep(1200);
  const confirm = await getDisputeConfirmInfo(
    SANDBOX_ORDER_ID,
    productInfoList
  );
  if (!confirm.ok) {
    console.error("FAILED:", confirm.error);
    process.exit(1);
  }
  console.log(JSON.stringify(confirm.data, null, 2));

  if (!doCreate) {
    console.log(
      "\nDry-run complete (steps 1–2). Pass --create to file a dispute."
    );
    process.exit(0);
  }

  const reason = confirm.data.disputeReasonList[0];
  if (!reason) {
    console.error("No dispute reasons returned");
    process.exit(1);
  }

  const expectType = confirm.data.expectResultOptionList.includes("1")
    ? (1 as const)
    : (2 as const);

  console.log("\n=== Step 3: create dispute ===");
  await sleep(1200);
  const created = await createDispute({
    cjOrderId: SANDBOX_ORDER_ID,
    businessDisputeId: buildBusinessDisputeId("sandbox-test"),
    disputeReasonId: reason.disputeReasonId,
    expectType,
    refundType: 1,
    messageText: "Aruviah admin dispute integration test",
    productInfoList,
  });
  if (!created.ok) {
    console.error("FAILED:", created.error);
    process.exit(1);
  }
  console.log("create: success");

  await sleep(2000);
  console.log("\n=== Dispute list ===");
  const list = await getDisputeList({ cjOrderId: SANDBOX_ORDER_ID });
  console.log(JSON.stringify(list, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
