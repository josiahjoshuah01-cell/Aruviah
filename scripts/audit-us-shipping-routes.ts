/**
 * Audit CJ freightCalculate US routes for all active CJ-mapped variants.
 * Also deep-probes ARV-00156 (product/query countryCode pattern + raw freight).
 *
 * Usage: npx tsx scripts/audit-us-shipping-routes.ts
 * Output: scripts/audit-us-shipping-routes.json
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";
import { getCJToken, warehouseFromCountryCode } from "../lib/cj";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const MIN_INTERVAL_MS = 1150;
const TARGET_SKU = "ARV-00156";

type CJEnvelope<T = unknown> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
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

async function cjFetch(
  label: string,
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

  let body: CJEnvelope;
  try {
    body = (await res.json()) as CJEnvelope;
  } catch {
    body = {
      code: -1,
      result: false,
      message: `Non-JSON response HTTP ${res.status}`,
    };
  }

  return {
    label,
    httpStatus: res.status,
    code: body.code,
    result: body.result,
    message: body.message,
    data: body.data,
    optionCount: Array.isArray(body.data) ? body.data.length : undefined,
  };
}

async function probeArv00156(token: string, row: {
  sku: string;
  cj_variant_id: string;
  ships_from_country: string | null;
  product: { title: string; cj_product_id: string | null } | null;
}) {
  const vid = row.cj_variant_id;
  const pid = row.product?.cj_product_id;
  const fromCode = warehouseFromCountryCode(row.ships_from_country);
  const probes: unknown[] = [];

  const paths = [
    pid ? `/product/query?pid=${pid}&countryCode=US` : null,
    pid ? `/product/query?pid=${pid}` : null,
    `/product/query?variantSku=${vid}&countryCode=US`,
    `/product/query?variantSku=${vid}`,
    `/product/stock/queryByVid?vid=${vid}`,
    `/product/stock/queryByVid?vid=${vid}&countryCode=US`,
  ].filter(Boolean) as string[];

  for (const path of paths) {
    const r = await cjFetch(path, { method: "GET", path }, token);
    const data = r.data as Record<string, unknown> | undefined;
    const variants = data?.variants as unknown[] | undefined;
    const matchVariant = Array.isArray(variants)
      ? variants.find((v) => String((v as { vid?: string }).vid) === vid)
      : null;

    probes.push({
      ...r,
      variantCount: Array.isArray(variants) ? variants.length : undefined,
      targetVidPresent: !!matchVariant,
      targetVidFreight: (matchVariant as { freight?: unknown })?.freight,
      targetVidInventories: (matchVariant as { inventories?: unknown })
        ?.inventories,
      productName: data?.productNameEn,
    });
  }

  const freightPayloads: { label: string; body: Record<string, unknown> }[] = [
    {
      label: "freightCalculate CN→US (default origin)",
      body: {
        startCountryCode: "CN",
        endCountryCode: "US",
        products: [{ vid, quantity: 1 }],
      },
    },
    {
      label: `freightCalculate ${fromCode}→US (stored ships_from)`,
      body: {
        startCountryCode: fromCode,
        endCountryCode: "US",
        products: [{ vid, quantity: 1 }],
      },
    },
    {
      label: "freightCalculate CN→US with zip 90210",
      body: {
        startCountryCode: "CN",
        endCountryCode: "US",
        zip: "90210",
        products: [{ vid, quantity: 1 }],
      },
    },
    {
      label: "freightCalculate US→US (if US warehouse)",
      body: {
        startCountryCode: "US",
        endCountryCode: "US",
        products: [{ vid, quantity: 1 }],
      },
    },
  ];

  for (const fp of freightPayloads) {
    const r = await cjFetch(
      fp.label,
      { method: "POST", path: "/logistic/freightCalculate", body: fp.body },
      token
    );
    const options = Array.isArray(r.data) ? r.data : [];
    probes.push({
      ...r,
      cheapestUsd:
        options.length > 0
          ? Math.min(
              ...options.map((o) => {
                const row = o as {
                  totalPostageFee?: number | string;
                  logisticPrice?: number | string;
                };
                const total = row.totalPostageFee ?? row.logisticPrice ?? 0;
                return parseFloat(String(total)) || 0;
              })
            )
          : null,
      logisticNames: options
        .slice(0, 5)
        .map((o) => (o as { logisticName?: string }).logisticName),
    });
  }

  return {
    sku: row.sku,
    title: row.product?.title,
    vid,
    pid,
    ships_from_country: row.ships_from_country,
    resolvedFromCode: fromCode,
    probes,
  };
}

type FreightStatus =
  | "shippable"
  | "no_routes"
  | "api_error"
  | "rate_limited";

async function classifyFreight(
  token: string,
  vid: string,
  fromCode: string
): Promise<{
  status: FreightStatus;
  optionCount: number;
  code: number;
  message: string;
  httpStatus: number;
  cheapestUsd: number | null;
}> {
  const r = await cjFetch(
    "catalog-scan",
    {
      method: "POST",
      path: "/logistic/freightCalculate",
      body: {
        startCountryCode: fromCode,
        endCountryCode: "US",
        products: [{ vid, quantity: 1 }],
      },
    },
    token
  );

  if (r.httpStatus === 429 || r.code === 1600200) {
    await sleep(2000);
    return classifyFreight(token, vid, fromCode);
  }

  if (r.code !== 200 || !r.result) {
    return {
      status: "api_error",
      optionCount: 0,
      code: r.code,
      message: r.message,
      httpStatus: r.httpStatus,
      cheapestUsd: null,
    };
  }

  const options = Array.isArray(r.data) ? r.data : [];
  if (options.length === 0) {
    return {
      status: "no_routes",
      optionCount: 0,
      code: r.code,
      message: r.message,
      httpStatus: r.httpStatus,
      cheapestUsd: null,
    };
  }

  const cheapestUsd = Math.min(
    ...options.map((o) => {
      const row = o as {
        totalPostageFee?: number | string;
        logisticPrice?: number | string;
      };
      const total = row.totalPostageFee ?? row.logisticPrice ?? 0;
      return parseFloat(String(total)) || 0;
    })
  );

  return {
    status: "shippable",
    optionCount: options.length,
    code: r.code,
    message: r.message,
    httpStatus: r.httpStatus,
    cheapestUsd,
  };
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  if (!url.includes(ARUVIAH_SUPABASE_PROJECT_REF)) {
    throw new Error(`Wrong project — need ${ARUVIAH_SUPABASE_PROJECT_REF}`);
  }
  assertAruviahProjectRef(ARUVIAH_SUPABASE_PROJECT_REF);

  const token = await getCJToken();
  if (!token) throw new Error("CJ token unavailable");

  const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: variants, error } = await sb
    .from("product_variants")
    .select(
      "id, sku, cj_variant_id, ships_from_country, is_active, product:products(title, is_active, cj_product_id)"
    )
    .not("cj_variant_id", "is", null)
    .eq("is_active", true);

  if (error || !variants?.length) {
    throw new Error("No active CJ-mapped variants");
  }

  const activeProducts = variants.filter((v) => {
    const p = Array.isArray(v.product) ? v.product[0] : v.product;
    return p?.is_active;
  });

  const arvRow = activeProducts.find((v) => v.sku === TARGET_SKU);
  const arvProbe = arvRow
    ? await probeArv00156(token, {
        sku: arvRow.sku,
        cj_variant_id: arvRow.cj_variant_id!,
        ships_from_country: arvRow.ships_from_country,
        product: (() => {
          const p = Array.isArray(arvRow.product)
            ? arvRow.product[0]
            : arvRow.product;
          return p
            ? { title: p.title, cj_product_id: p.cj_product_id }
            : null;
        })(),
      })
    : { error: `${TARGET_SKU} not found in active catalog` };

  console.log(`\n=== Deep probe: ${TARGET_SKU} ===`);
  console.log(JSON.stringify(arvProbe, null, 2));

  console.log(
    `\n=== Catalog scan: ${activeProducts.length} active CJ-mapped variants ===`
  );

  const scanResults: Array<{
    sku: string;
    title: string;
    vid: string;
    ships_from_country: string | null;
    fromCode: string;
    status: FreightStatus;
    optionCount: number;
    cheapestUsd: number | null;
    cjCode: number;
    cjMessage: string;
  }> = [];

  let idx = 0;
  for (const v of activeProducts) {
    idx++;
    const product = Array.isArray(v.product) ? v.product[0] : v.product;
    const fromCode = warehouseFromCountryCode(v.ships_from_country);
    const result = await classifyFreight(token, v.cj_variant_id!, fromCode);

    scanResults.push({
      sku: v.sku,
      title: product?.title ?? "?",
      vid: v.cj_variant_id!,
      ships_from_country: v.ships_from_country,
      fromCode,
      status: result.status,
      optionCount: result.optionCount,
      cheapestUsd: result.cheapestUsd,
      cjCode: result.code,
      cjMessage: result.message,
    });

    if (idx % 10 === 0) {
      console.log(`  scanned ${idx}/${activeProducts.length}…`);
    }
  }

  const shippable = scanResults.filter((r) => r.status === "shippable");
  const noRoutes = scanResults.filter((r) => r.status === "no_routes");
  const apiErrors = scanResults.filter((r) => r.status === "api_error");

  const summary = {
    totalActiveCjVariants: activeProducts.length,
    shippableToUs: shippable.length,
    noUsRoutes: noRoutes.length,
    apiErrors: apiErrors.length,
    shippablePct:
      activeProducts.length > 0
        ? Math.round((shippable.length / activeProducts.length) * 1000) / 10
        : 0,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    arv00156DeepProbe: arvProbe,
    unshippableToUs: noRoutes,
    apiErrorVariants: apiErrors,
    shippableSample: shippable.slice(0, 5),
  };

  const outPath = resolve(process.cwd(), "scripts/audit-us-shipping-routes.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nUnshippable to US (${noRoutes.length}):`);
  for (const r of noRoutes) {
    console.log(`  ${r.sku}  ${r.title.slice(0, 60)}  vid=${r.vid}  from=${r.fromCode}`);
  }
  if (apiErrors.length > 0) {
    console.log(`\nAPI errors (${apiErrors.length}):`);
    for (const r of apiErrors) {
      console.log(`  ${r.sku}  code=${r.cjCode}  ${r.cjMessage}`);
    }
  }
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
