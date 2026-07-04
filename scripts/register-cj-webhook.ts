/**
 * Register CJ webhook for ORDER and LOGISTICS topics.
 * Usage: npx tsx scripts/register-cj-webhook.ts
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
const WEBHOOK_URL = "https://aruviahcom.vercel.app/api/cj/webhook";

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
  return body.data.accessToken;
}

async function main() {
  if (!process.env.CJ_API_KEY) {
    console.error("CJ_API_KEY not set");
    process.exit(1);
  }

  const token = await getAccessToken();
  console.log("Got access token");

  const payload = {
    order: { type: "ENABLE", callbackUrls: [WEBHOOK_URL] },
    logistics: { type: "ENABLE", callbackUrls: [WEBHOOK_URL] },
  };

  console.log("\nRegistering webhook:");
  console.log(JSON.stringify(payload, null, 2));

  const res = await fetch(`${CJ_API_BASE}/webhook/set`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": token,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json();
  console.log("\nCJ response:");
  console.log(JSON.stringify(body, null, 2));

  if (body.code === 200 && body.result) {
    console.log("\nWebhook registered successfully!");
  } else {
    console.error("\nWebhook registration FAILED");
    process.exit(1);
  }
}

main().catch(console.error);
