/**
 * Live CJ quota / points probe — setting/get + cheap product/query.
 * Usage: npx tsx scripts/cj-quota-probe.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) throw new Error("Missing .env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const apiKey = process.env.CJ_API_KEY?.trim();
  if (!apiKey) throw new Error("CJ_API_KEY missing");

  const base = "https://developers.cjdropshipping.com/api2.0/v1";

  const authRes = await fetch(`${base}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const auth = await authRes.json();
  if (auth.code !== 200 || !auth.data?.accessToken) {
    console.error("Auth failed:", auth);
    process.exit(1);
  }
  const token = auth.data.accessToken as string;
  const headers = { "CJ-Access-Token": token };

  await new Promise((r) => setTimeout(r, 1200));

  const settingRes = await fetch(`${base}/setting/get`, { headers });
  const setting = await settingRes.json();

  console.log("\n=== GET /setting/get (full JSON) ===");
  console.log(JSON.stringify(setting, null, 2));

  await new Promise((r) => setTimeout(r, 1200));

  // Cheap call: product/query on a known pid from prior probe
  const pid = "2066705895255461889"; // jewelry box from sandbox staging
  const queryRes = await fetch(
    `${base}/product/query?pid=${encodeURIComponent(pid)}&countryCode=US`,
    { headers }
  );
  const query = await queryRes.json();

  console.log("\n=== GET /product/query (envelope only — no huge product body) ===");
  console.log(
    JSON.stringify(
      {
        code: query.code,
        result: query.result,
        message: query.message,
        requestId: query.requestId,
        success: query.success,
        pointsInfo: query.pointsInfo ?? null,
        dataKeys: query.data ? Object.keys(query.data) : null,
        pid: query.data?.pid ?? null,
        variantCount: query.data?.variants?.length ?? null,
      },
      null,
      2
    )
  );

  const outPath = resolve(process.cwd(), "scripts/cj-quota-probe-latest.json");
  writeFileSync(
    outPath,
    JSON.stringify({ capturedAt: new Date().toISOString(), setting, queryEnvelope: {
      code: query.code,
      result: query.result,
      message: query.message,
      requestId: query.requestId,
      success: query.success,
      pointsInfo: query.pointsInfo ?? null,
    } }, null, 2)
  );
  console.log(`\nSaved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
