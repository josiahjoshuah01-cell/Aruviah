/**
 * Unit-test daily cap logic + optional live cap_blocked simulation.
 * Usage: npx tsx scripts/test-cj-auto-pay-cap.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  getAdminSettings,
  updateAdminSettings,
  wouldExceedAutoPayCap,
} from "../lib/admin-settings";
import { tryAutoPayCjOrder } from "../lib/cj-payment";
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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function main() {
  console.log("=== cap logic (unit) ===");
  assert(wouldExceedAutoPayCap(50, 40, 100) === false, "50+40 <= 100");
  assert(wouldExceedAutoPayCap(50, 51, 100) === true, "50+51 > 100");
  assert(wouldExceedAutoPayCap(100, 0.01, 100) === true, "at cap + penny");
  console.log("PASS: wouldExceedAutoPayCap");

  const runLive = process.argv.includes("--live");
  if (!runLive) {
    console.log("\nSkipping live DB test (pass --live to run cap_blocked simulation).");
    return;
  }

  loadEnvLocal();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: unpaid } = await supabase
    .from("orders")
    .select("id")
    .eq("cj_payment_status", "unpaid")
    .limit(1)
    .maybeSingle();

  if (!unpaid?.id) {
    console.log("No unpaid CJ order in DB — create one via checkout first.");
    return;
  }

  const prev = await getAdminSettings();
  await updateAdminSettings({
    cj_auto_pay_enabled: true,
    cj_auto_pay_daily_cap_usd: 0.01,
  });

  console.log(`\n=== live cap_blocked on order ${unpaid.id} ===`);
  const result = await tryAutoPayCjOrder(unpaid.id);
  console.log("tryAutoPayCjOrder:", result);

  const { data: log } = await supabase
    .from("cj_auto_pay_logs")
    .select("outcome, error_message")
    .eq("order_id", unpaid.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log("latest log:", log);
  assert(result.attempted === true && result.paid === false, "should not pay");
  assert(log?.outcome === "cap_blocked", "log should be cap_blocked");

  await updateAdminSettings({
    cj_auto_pay_enabled: prev.cj_auto_pay_enabled,
    cj_auto_pay_daily_cap_usd: prev.cj_auto_pay_daily_cap_usd,
  });
  console.log("PASS: cap_blocked simulation (settings restored)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
