/**
 * Classify unshippable-to-US variants into buckets A / B / C.
 *
 * Bucket A: US warehouse stock + valid US→US route (ships_from_country data fix)
 * Bucket B: No US stock; has non-US stock; no route from that origin → US
 * Bucket C: Has stock but zero valid routes to US from any warehouse origin
 *
 * Usage: npx tsx scripts/classify-unshippable-us-buckets.ts
 * Output: scripts/unshippable-us-bucket-classification.json
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { getCJToken } from "../lib/cj";
import { freightOptionCostUsd, selectCheapestFreightOption } from "../lib/checkout-shipping";
import type { CjFreightOption } from "../lib/cj";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const MIN_INTERVAL_MS = 1150;
const AUDIT_PATH = resolve(process.cwd(), "scripts/audit-us-shipping-routes.json");
const OUT_PATH = resolve(
  process.cwd(),
  "scripts/unshippable-us-bucket-classification.json"
);

type StockRow = {
  vid?: string;
  countryCode?: string;
  areaEn?: string;
  totalInventoryNum?: number;
  cjInventoryNum?: number;
};

type UnshippableRow = {
  sku: string;
  title: string;
  vid: string;
  ships_from_country: string | null;
  fromCode: string;
};

type WarehouseStock = {
  countryCode: string;
  areaEn: string | null;
  totalInventory: number;
};

type OriginFreightResult = {
  fromCountryCode: string;
  optionCount: number;
  cheapestUsd: number | null;
  logisticName: string | null;
  cjCode: number;
  cjMessage: string;
};

type Bucket = "A" | "B" | "C";

type Classification = {
  sku: string;
  title: string;
  vid: string;
  ships_from_country: string | null;
  storedFromCode: string;
  warehouses: WarehouseStock[];
  originFreight: OriginFreightResult[];
  bucket: Bucket;
  bucketReason: string;
};

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastCallAt = 0;

async function cjRequest(
  init: { method: "GET" | "POST"; path: string; body?: unknown },
  token: string
) {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  const url = init.path.startsWith("http")
    ? init.path
    : `${CJ_API_BASE}${init.path}`;

  const res = await fetch(url, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": token,
    },
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  });

  const body = (await res.json()) as {
    code: number;
    result: boolean;
    message: string;
    data?: unknown;
  };

  return { httpStatus: res.status, ...body };
}

async function queryStockByVid(
  vid: string,
  token: string
): Promise<WarehouseStock[]> {
  const res = await cjRequest(
    { method: "GET", path: `/product/stock/queryByVid?vid=${vid}` },
    token
  );

  if (res.code !== 200 || !Array.isArray(res.data)) {
    return [];
  }

  return (res.data as StockRow[])
    .map((row) => ({
      countryCode: (row.countryCode ?? "").trim().toUpperCase(),
      areaEn: row.areaEn?.trim() ?? null,
      totalInventory: Number(row.totalInventoryNum ?? row.cjInventoryNum ?? 0),
    }))
    .filter((row) => row.countryCode && row.totalInventory > 0);
}

async function freightToUs(
  vid: string,
  fromCountryCode: string,
  token: string
): Promise<OriginFreightResult> {
  const res = await cjRequest(
    {
      method: "POST",
      path: "/logistic/freightCalculate",
      body: {
        startCountryCode: fromCountryCode,
        endCountryCode: "US",
        products: [{ vid, quantity: 1 }],
      },
    },
    token
  );

  const options = Array.isArray(res.data) ? (res.data as CjFreightOption[]) : [];
  const chosen = selectCheapestFreightOption(options);

  return {
    fromCountryCode,
    optionCount: options.length,
    cheapestUsd: chosen != null ? freightOptionCostUsd(chosen) : null,
    logisticName: chosen?.logisticName ?? null,
    cjCode: res.code,
    cjMessage: res.message,
  };
}

function classifyVariant(params: {
  row: UnshippableRow;
  warehouses: WarehouseStock[];
  originFreight: OriginFreightResult[];
}): { bucket: Bucket; reason: string } {
  const { warehouses, originFreight } = params;
  const hasAnyStock = warehouses.length > 0;
  const usWarehouse = warehouses.find((w) => w.countryCode === "US");
  const usFreight = originFreight.find((f) => f.fromCountryCode === "US");
  const anyRoute = originFreight.some((f) => f.optionCount > 0);

  if (usWarehouse && usFreight && usFreight.optionCount > 0) {
    return {
      bucket: "A",
      reason: `US warehouse stock (${usWarehouse.totalInventory} units) + US→US route (${usFreight.logisticName}, $${usFreight.cheapestUsd?.toFixed(2) ?? "?"}) — fix ships_from_country to US`,
    };
  }

  if (anyRoute) {
    const working = originFreight.filter((f) => f.optionCount > 0);
    return {
      bucket: "A",
      reason: `Route exists from ${working.map((w) => `${w.fromCountryCode} ($${w.cheapestUsd?.toFixed(2)})`).join(", ")} but stored origin was wrong — data fix`,
    };
  }

  if (!hasAnyStock) {
    return {
      bucket: "B",
      reason: "No CJ warehouse stock recorded; no freight route from CN fallback → US",
    };
  }

  if (usWarehouse && (!usFreight || usFreight.optionCount === 0)) {
    const nonUs = warehouses.filter((w) => w.countryCode !== "US");
    if (nonUs.length === 0) {
      return {
        bucket: "C",
        reason: `US warehouse stock (${usWarehouse.totalInventory} units) but zero US→US carriers — dead for US`,
      };
    }
  }

  const nonUsWarehouses = warehouses.filter((w) => w.countryCode !== "US");
  if (nonUsWarehouses.length > 0 && !usWarehouse) {
    const origins = nonUsWarehouses.map((w) => w.countryCode).join(", ");
    return {
      bucket: "B",
      reason: `Stock only in ${origins}; no ${origins}→US freight routes — CJ shipping limitation`,
    };
  }

  if (hasAnyStock) {
    const origins = warehouses.map((w) => w.countryCode).join(", ");
    return {
      bucket: "C",
      reason: `Stock in ${origins} but zero routes to US from any tried origin`,
    };
  }

  return {
    bucket: "B",
    reason: "No shippable route to US",
  };
}

async function main() {
  loadEnvLocal();

  if (!existsSync(AUDIT_PATH)) {
    throw new Error(`Missing ${AUDIT_PATH} — run audit-us-shipping-routes.ts first`);
  }

  const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8")) as {
    unshippableToUs: UnshippableRow[];
  };

  const rows = audit.unshippableToUs;
  if (!rows?.length) {
    throw new Error("No unshippable variants in audit file");
  }

  const token = await getCJToken();
  if (!token) throw new Error("CJ token unavailable");

  console.log(`Classifying ${rows.length} unshippable variants…\n`);

  const classifications: Classification[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`[${i + 1}/${rows.length}] ${row.sku}…`);

    const warehouses = await queryStockByVid(row.vid, token);

    const originsToTry = new Set<string>();
    for (const w of warehouses) {
      originsToTry.add(w.countryCode);
    }
    if (originsToTry.size === 0) {
      originsToTry.add("CN");
    }

    const originFreight: OriginFreightResult[] = [];
    for (const from of [...originsToTry].sort()) {
      originFreight.push(await freightToUs(row.vid, from, token));
    }

    const { bucket, reason } = classifyVariant({
      row,
      warehouses,
      originFreight,
    });

    classifications.push({
      sku: row.sku,
      title: row.title,
      vid: row.vid,
      ships_from_country: row.ships_from_country,
      storedFromCode: row.fromCode,
      warehouses,
      originFreight,
      bucket,
      bucketReason: reason,
    });
  }

  const counts = {
    A: classifications.filter((c) => c.bucket === "A").length,
    B: classifications.filter((c) => c.bucket === "B").length,
    C: classifications.filter((c) => c.bucket === "C").length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    total: classifications.length,
    counts,
    bucketDefinitions: {
      A: "US warehouse stock + valid US→US route (or other fixable wrong origin) — ships_from_country data fix",
      B: "No US stock; ships from non-US warehouse; no route from that origin → US — CJ limitation",
      C: "Has stock but zero valid routes to US from any warehouse origin — dead for US market",
    },
    classifications,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  console.log("\n=== Bucket counts ===");
  console.log(`A (data fix):     ${counts.A}`);
  console.log(`B (CJ limit):     ${counts.B}`);
  console.log(`C (dead for US):  ${counts.C}`);
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
