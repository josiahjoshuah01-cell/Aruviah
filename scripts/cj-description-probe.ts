/**
 * Probe CJ /product/query description field for one real product.
 * Usage: npx tsx scripts/cj-description-probe.ts [pid]
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { getCjAccessToken } from "../lib/cj-staging";

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

const DEFAULT_PID = "2606270658351616600";

async function main() {
  loadEnvLocal();
  const pid = process.argv[2] ?? DEFAULT_PID;
  const apiKey = process.env.CJ_API_KEY?.trim();
  if (!apiKey) throw new Error("CJ_API_KEY missing");

  const token = await getCjAccessToken(apiKey);
  const url = `https://developers.cjdropshipping.com/api2.0/v1/product/query?pid=${encodeURIComponent(pid)}&countryCode=US`;
  const res = await fetch(url, {
    headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
  });
  const body = await res.json();

  const data = body.data ?? {};
  const descKeys = Object.keys(data).filter((k) =>
    /desc|remark|detail|content|info/i.test(k)
  );

  console.log("pid:", data.pid ?? pid);
  console.log("title:", data.productNameEn);
  console.log("description-related keys:", descKeys);
  console.log("\n=== RAW description field (typeof, length) ===");
  console.log("typeof:", typeof data.description);
  console.log("length:", data.description?.length ?? 0);
  console.log("\n=== RAW description (first 3000 chars) ===");
  console.log(String(data.description ?? "(missing)").slice(0, 3000));

  const outPath = resolve(process.cwd(), "scripts/cj-description-probe-sample.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        pid: data.pid,
        productNameEn: data.productNameEn,
        description: data.description ?? null,
        remark: data.remark ?? null,
        descriptionKeys: descKeys,
      },
      null,
      2
    )
  );
  console.log("\nWrote full sample to", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
