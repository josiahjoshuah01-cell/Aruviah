/**
 * End-to-end CJ sandbox order test (no real wallet charge).
 *
 * Requires a CJ account configured as sandbox by CJ support.
 * Usage: npx tsx scripts/test-cj-sandbox-order.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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

function logStep(label: string, data: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function main() {
  loadEnvLocal();

  const unsetDefault = process.env.CJ_SANDBOX_MODE;
  const { isCjSandboxMode: checkDefault } = await import("../lib/cj");
  console.log(
    `CJ_SANDBOX_MODE before test: ${unsetDefault ?? "(unset)"} → isCjSandboxMode=${checkDefault()}`
  );
  console.log(
    "Enabling sandbox for this script run only (process.env.CJ_SANDBOX_MODE=true)\n"
  );
  process.env.CJ_SANDBOX_MODE = "true";

  const {
    createCJOrder,
    getCjOrderDetail,
    getCjOrderLogisticsOptions,
    getValidLogisticsOptions,
    updateCjOrderLogistics,
    cjConfirmOrder,
    cjSandboxSimulatePay,
    cjSandboxUpdateStatus,
    isCjSandboxMode,
  } = await import("../lib/cj");

  if (!isCjSandboxMode()) {
    throw new Error("isCjSandboxMode() should be true after env set");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const sb = createClient(url, key);
  const { data: variant, error: variantError } = await sb
    .from("product_variants")
    .select(
      "id, sku, cj_variant_id, ships_from_country, product:products(title)"
    )
    .not("cj_variant_id", "is", null)
    .eq("is_active", true)
    .order("ships_from_country", { ascending: true })
    .limit(20);

  const picked =
    (variant ?? []).find((v) => v.ships_from_country === "CN") ??
    (variant ?? []).find((v) => v.ships_from_country === "US") ??
    variant?.[0];

  if (variantError || !picked?.cj_variant_id) {
    throw new Error(
      "No mapped CJ variant in DB — stage/approve a CJ product first"
    );
  }

  const product = Array.isArray(picked.product)
    ? picked.product[0]
    : picked.product;

  logStep("Mapped variant", {
    sku: picked.sku,
    variantId: picked.id,
    cj_variant_id: picked.cj_variant_id,
    ships_from_country: picked.ships_from_country,
    title: product?.title,
  });

  const endCountry = "US";
  const startCountry =
    picked.ships_from_country === "US"
      ? "US"
      : process.env.CJ_FROM_COUNTRY_CODE?.trim() || "CN";

  logStep("Step 0 — freightCalculate (real logistics options)", {
    vid: picked.cj_variant_id,
    quantity: 1,
    startCountryCode: startCountry,
    endCountryCode: endCountry,
    note: "startCountry matches createOrderV2 fromCountryCode",
  });

  const freightOptions = await getValidLogisticsOptions(
    [{ vid: picked.cj_variant_id, quantity: 1 }],
    startCountry,
    endCountry
  );

  logStep("freightCalculate results", freightOptions);

  if (freightOptions.length === 0) {
    throw new Error(
      "freightCalculate returned no options — cannot pick a valid logisticName"
    );
  }

  const chosenFreight = freightOptions[0];
  logStep("Using logisticName from freightCalculate", chosenFreight);

  const testOrderId = `sandbox-test-${Date.now()}`;
  logStep("Step 1 — createOrderV2 (isSandbox: 1)", {
    orderNumber: testOrderId,
    logisticName: chosenFreight.logisticName,
  });

  const createResult = await createCJOrder({
    orderId: testOrderId,
    email: process.env.CJ_EMAIL ?? "sandbox@test.aruviah.local",
    logisticName: chosenFreight.logisticName,
    fromCountryCode: startCountry,
    shipping: {
      firstName: "Sandbox",
      lastName: "Tester",
      address: "123 Test Street",
      city: "Los Angeles",
      country: "US",
      phone: "5550100123",
    },
    items: [
      {
        variantId: picked.id,
        sku: picked.sku,
        qty: 1,
      },
    ],
  });

  if (!("success" in createResult) || !createResult.success) {
    logStep("createOrderV2 FAILED", createResult);
    process.exit(1);
  }

  const { cjOrderId, shipmentOrderId, orderAmountUsd } = createResult;
  const orderCode = cjOrderId;
  const sandboxOrderId = orderCode;
  logStep("createOrderV2 OK", {
    cjOrderId,
    orderCode,
    shipmentOrderId,
    orderAmountUsd,
  });

  let detailAfterCreate = await getCjOrderDetail(orderCode);
  logStep("getOrderDetail after create", detailAfterCreate);
  await sleep(1200);

  logStep("Step 1c — getOrderLogisticsInfo", { orderCode });
  const logistics = await getCjOrderLogisticsOptions(orderCode);
  logStep("available logistics (post-create)", logistics);
  await sleep(1200);
  if (logistics.length > 0) {
    const chosen =
      logistics.find((l) => l.logisticsName === chosenFreight.logisticName) ??
      logistics[0];
    logStep("Step 1d — updateLogistics", chosen);
    const logisticsUpd = await updateCjOrderLogistics({
      id: chosen.id,
      orderCode: chosen.orderCode,
      logisticsName: chosen.logisticsName,
    });
    if (!logisticsUpd.ok) {
      logStep("updateLogistics FAILED", logisticsUpd);
      process.exit(1);
    }
    logStep("updateLogistics OK", logisticsUpd);
  } else {
    logStep(
      "No logistics from getOrderLogisticsInfo — proceeding with freightCalculate name",
      { logisticName: chosenFreight.logisticName }
    );
  }

  logStep("Step 1e — confirmOrder if still CREATED", {
    orderId: sandboxOrderId,
  });
  let activeCjOrderId = sandboxOrderId;
  detailAfterCreate = await getCjOrderDetail(activeCjOrderId);
  await sleep(1200);

  if (
    !detailAfterCreate?.orderStatus ||
    detailAfterCreate.orderStatus.toUpperCase() === "CREATED" ||
    detailAfterCreate.orderStatus === "100"
  ) {
    const confirmResult = await cjConfirmOrder(activeCjOrderId);
    if (!confirmResult.ok) {
      logStep("confirmOrder FAILED", confirmResult);
    } else {
      activeCjOrderId = confirmResult.orderId;
      logStep("confirmOrder OK", { activeCjOrderId });
    }
  } else {
    logStep("confirmOrder skipped", {
      reason: `status already ${detailAfterCreate?.orderStatus}`,
    });
  }

  logStep("Step 2 — sandbox/simulatePay", { orderId: activeCjOrderId });
  await sleep(1200);
  const payResult = await cjSandboxSimulatePay({
    orderId: activeCjOrderId,
    shipmentOrderId: shipmentOrderId ?? undefined,
  });
  if (!payResult.ok) {
    logStep("simulatePay FAILED", payResult);
  } else {
    logStep("simulatePay OK", payResult);
  }

  let detail = await getCjOrderDetail(activeCjOrderId);
  logStep("getOrderDetail after pay attempt", detail);
  await sleep(1200);

  for (const status of [400, 500, 600] as const) {
    const label =
      status === 400
        ? "unshipped"
        : status === 500
          ? "shipped"
          : "completed";
    logStep(`Step — sandbox/updateStatus → ${status} (${label})`, {
      orderId: activeCjOrderId,
      targetStatus: status,
    });
    const upd = await cjSandboxUpdateStatus(activeCjOrderId, status);
    await sleep(1200);
    if (!upd.ok) {
      logStep(`updateStatus ${status} FAILED`, upd);
    } else {
      logStep(`updateStatus ${status} OK`, upd);
    }
    detail = await getCjOrderDetail(activeCjOrderId);
    logStep(`getOrderDetail after status ${status}`, detail);
  }

  logStep("Final tracking fields", {
    trackNumber: detail?.trackNumber ?? null,
    trackingProvider: detail?.trackingProvider ?? null,
    trackingUrl: detail?.trackingUrl ?? null,
    orderStatus: detail?.orderStatus ?? null,
  });

  console.log("\n✓ Sandbox order pipeline test complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
