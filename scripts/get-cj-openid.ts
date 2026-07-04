/**
 * Fetch the CJ account openId via GET /setting/get.
 * Usage: npx tsx scripts/get-cj-openid.ts
 */
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const idx = line.indexOf("=");
  if (idx < 1 || line.startsWith("#")) continue;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim();
  if (key && !process.env[key]) process.env[key] = val;
}

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

async function getAccessToken(): Promise<string> {
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
  });
  const body = await res.json();
  if (body.code !== 200 || !body.data?.accessToken) {
    throw new Error(`getAccessToken failed: ${JSON.stringify(body)}`);
  }
  console.log("openId from token response:", body.data.openId ?? "(not in token response)");
  return body.data.accessToken;
}

async function getSettings(token: string) {
  const res = await fetch(`${CJ_API_BASE}/setting/get`, {
    headers: { "CJ-Access-Token": token },
  });
  const body = await res.json();
  console.log("\nGET /setting/get response:");
  console.log(JSON.stringify(body, null, 2));
}

async function main() {
  if (!process.env.CJ_API_KEY) {
    console.error("CJ_API_KEY not set");
    process.exit(1);
  }
  const token = await getAccessToken();
  await getSettings(token);
}

main().catch(console.error);
