/**
 * Dump CJ shipping-origin fields from live API responses.
 * Usage: npx tsx scripts/cj-shipping-probe.ts [pid]
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const DEFAULT_PID = "2070159544046288898"; // US-stock smart scale from probe
const DEFAULT_CN_PID = "2606270658351616600"; // CN earphones from probe

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

async function probePid(pid: string, headers: Record<string, string>) {
  const listRes = await fetch(
    `${CJ_API_BASE}/product/list?pageNum=1&pageSize=20&countryCode=US`,
    { headers }
  );
  const listBody = await listRes.json();
  const listItem = listBody.data?.list?.find(
    (p: { pid: string }) => p.pid === pid
  );

  const queryRes = await fetch(
    `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(pid)}&countryCode=US`,
    { headers }
  );
  const queryBody = await queryRes.json();
  const firstVid = queryBody.data?.variants?.[0]?.vid as string | undefined;

  let variantBody: unknown = null;
  let stockBody: unknown = null;
  if (firstVid) {
    const variantRes = await fetch(
      `${CJ_API_BASE}/product/variant/queryByVid?vid=${encodeURIComponent(firstVid)}&features=enable_inventory`,
      { headers }
    );
    variantBody = await variantRes.json();

    const stockRes = await fetch(
      `${CJ_API_BASE}/product/stock/queryByVid?vid=${encodeURIComponent(firstVid)}`,
      { headers }
    );
    stockBody = await stockRes.json();
  }

  return {
    pid,
    list_shippingCountryCodes: listItem?.shippingCountryCodes ?? null,
    query_variant_inventories_sample:
      queryBody.data?.variants?.[0]?.inventories ?? null,
    variant_queryByVid_inventories:
      (variantBody as { data?: { inventories?: unknown } })?.data
        ?.inventories ?? null,
    stock_queryByVid_rows:
      (stockBody as { data?: unknown })?.data ?? null,
  };
}

async function main() {
  loadEnvLocal();
  const apiKey = process.env.CJ_API_KEY?.trim();
  if (!apiKey) throw new Error("CJ_API_KEY missing");

  const authRes = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const authBody = await authRes.json();
  const token = authBody.data?.accessToken as string;
  const headers = { "CJ-Access-Token": token };

  const pids = process.argv.slice(2).filter(Boolean);
  const targets = pids.length > 0 ? pids : [DEFAULT_PID, DEFAULT_CN_PID];

  const results = [];
  for (const pid of targets) {
    results.push(await probePid(pid, headers));
    await new Promise((r) => setTimeout(r, 400));
  }

  const outPath = resolve(process.cwd(), "scripts/cj-shipping-fields.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
