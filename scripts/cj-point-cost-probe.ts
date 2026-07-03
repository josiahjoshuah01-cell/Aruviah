/**
 * Measure CJ point costs by comparing pointsInfo.usedToday before/after each call.
 * Usage: npx tsx scripts/cj-point-cost-probe.ts
 */
import { readFileSync, existsSync } from "fs";
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  loadEnvLocal();
  const apiKey = process.env.CJ_API_KEY?.trim();
  if (!apiKey) throw new Error("CJ_API_KEY missing");

  const base = "https://developers.cjdropshipping.com/api2.0/v1";
  const auth = await fetch(`${base}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  }).then((r) => r.json());
  const token = auth.data?.accessToken as string;
  if (!token) throw new Error("Auth failed");
  const headers = { "CJ-Access-Token": token };

  async function measure(label: string, call: () => Promise<{ code?: number }>) {
    await sleep(1200);
    const before = await fetch(`${base}/setting/get`, { headers }).then((r) =>
      r.json()
    );
    const u0 = (before as { pointsInfo?: { usedToday?: number } }).pointsInfo
      ?.usedToday;
    await sleep(600);
    const res = await call();
    await sleep(600);
    const after = await fetch(`${base}/setting/get`, { headers }).then((r) =>
      r.json()
    );
    const u1 = (after as { pointsInfo?: { usedToday?: number } }).pointsInfo
      ?.usedToday;
    console.log(
      JSON.stringify({
        label,
        usedBefore: u0,
        usedAfter: u1,
        delta: (u1 ?? 0) - (u0 ?? 0),
        code: res.code,
      })
    );
  }

  const pid = "2066705895255461889";
  await measure("product/list", () =>
    fetch(`${base}/product/list?pageNum=1&pageSize=1&countryCode=US`, {
      headers,
    }).then((r) => r.json())
  );
  await measure("product/productComments", () =>
    fetch(
      `${base}/product/productComments?pid=${encodeURIComponent(pid)}&pageNum=1&pageSize=1`,
      { headers }
    ).then((r) => r.json())
  );
  const q = await fetch(
    `${base}/product/query?pid=${encodeURIComponent(pid)}&countryCode=US`,
    { headers }
  ).then((r) => r.json());
  const vid = (q as { data?: { variants?: { vid?: string }[] } }).data
    ?.variants?.[0]?.vid;
  if (vid) {
    await measure("product/stock/queryByVid", () =>
      fetch(
        `${base}/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`,
        { headers }
      ).then((r) => r.json())
    );
    await measure("product/variant/queryByVid", () =>
      fetch(
        `${base}/product/variant/queryByVid?vid=${encodeURIComponent(vid)}&features=enable_inventory`,
        { headers }
      ).then((r) => r.json())
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
