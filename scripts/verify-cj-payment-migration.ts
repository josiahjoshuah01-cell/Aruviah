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

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  console.log("=== 1. admin_settings ===");
  const { data: settings, error: settingsErr } = await supabase
    .from("admin_settings")
    .select("*");
  if (settingsErr) {
    console.log("ERROR:", settingsErr.message);
  } else {
    console.log(JSON.stringify(settings, null, 2));
  }

  console.log("\n=== 2. orders.cj_payment_status sample ===");
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, cj_order_id, cj_payment_status, cj_shipment_order_id, cj_order_amount_usd")
    .limit(5);
  if (ordersErr) {
    console.log("ERROR (column likely missing):", ordersErr.message);
  } else {
    console.log(JSON.stringify(orders, null, 2));
  }

  console.log("\n=== 3. cj_auto_pay_logs ===");
  const { data: logs, error: logsErr } = await supabase
    .from("cj_auto_pay_logs")
    .select("id, order_id, outcome, amount_usd, created_at")
    .limit(3);
  if (logsErr) {
    console.log("ERROR (table likely missing):", logsErr.message);
  } else {
    console.log(
      logs?.length
        ? JSON.stringify(logs, null, 2)
        : "[] (table exists, no rows yet)"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
