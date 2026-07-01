/**
 * CJ catalog import — run with: npm run import:cj
 * Replaces placeholder products with real CJ-backed catalog (10–20 items).
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const MARKUP_MULTIPLIER = 2;
const DEFAULT_STOCK = 50;
const LOG_PATH = resolve(process.cwd(), "scripts/cj-import-log.json");

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
  requestId?: string;
};

type CJListItem = {
  pid: string;
  productNameEn: string;
  productSku: string;
  productImage: string;
  sellPrice: string | number;
  categoryName?: string;
  saleStatus?: number;
};

type CJVariant = {
  vid: string;
  pid: string;
  variantSellPrice?: number | string;
  variantImage?: string;
  inventories?: Array<{ totalInventory?: number }>;
};

type CJProductDetail = {
  pid: string;
  productNameEn: string;
  productSku: string;
  bigImage?: string;
  productImageSet?: string[];
  sellPrice?: number | string;
  description?: string;
  categoryName?: string;
  variants?: CJVariant[];
};

type ImportLog = {
  step1_safety: Record<string, unknown>;
  api_calls: Array<{ endpoint: string; request: string; response: unknown }>;
  imported: Array<Record<string, unknown>>;
  deactivated: Array<{ id: string; sku: string; reason: string }>;
  deleted_placeholder_count: number;
  errors: string[];
};

const SLUG_TERMS: Record<string, string[]> = {
  electronics: [
    "electronic",
    "earphone",
    "headphone",
    "bluetooth",
    "usb",
    "cable",
    "charger",
    "phone",
    "power",
    "smart",
    "watch",
    "speaker",
    "camera",
    "led",
    "scale",
  ],
  home: [
    "home",
    "blanket",
    "pillow",
    "bed",
    "storage",
    "basket",
    "clock",
    "cushion",
    "decor",
    "furniture",
    "hook",
    "curtain",
    "organizer",
    "lamp",
  ],
  kitchen: [
    "kitchen",
    "mug",
    "cup",
    "knife",
    "cutting",
    "cook",
    "pot",
    "pan",
    "spatula",
    "food",
    "utensil",
    "dish",
  ],
  fashion: [
    "fashion",
    "shirt",
    "hoodie",
    "bag",
    "sunglass",
    "clothing",
    "women",
    "men",
    "dress",
    "hat",
    "jacket",
    "pants",
  ],
};

function matchesCategorySlug(
  slug: string,
  productNameEn: string,
  categoryName?: string
): boolean {
  const terms = SLUG_TERMS[slug] ?? [];
  const haystack = `${productNameEn} ${categoryName ?? ""}`.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

const CATEGORY_SEARCHES: { slug: string; keywords: string[] }[] = [
  {
    slug: "electronics",
    keywords: ["bluetooth earbuds", "usb cable", "phone holder", "power bank"],
  },
  {
    slug: "home",
    keywords: ["throw blanket", "storage basket", "wall clock", "pillow case"],
  },
  {
    slug: "kitchen",
    keywords: ["kitchen knife", "coffee mug", "cutting board", "spatula"],
  },
  {
    slug: "fashion",
    keywords: ["women t-shirt", "hoodie", "crossbody bag", "sunglasses"],
  },
];

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

function parsePrice(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const match = String(raw).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\bfree shipping\b/gi, "")
    .replace(/\bhot sale\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function variantStock(variant: CJVariant): number | null {
  const inv = variant.inventories?.[0]?.totalInventory;
  if (typeof inv === "number" && inv > 0) return inv;
  return null;
}

async function main() {
  loadEnvLocal();
  const log: ImportLog = {
    step1_safety: {},
    api_calls: [],
    imported: [],
    deactivated: [],
    deleted_placeholder_count: 0,
    errors: [],
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // STEP 1 — Safety check
  const { count: ordersCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });
  const { count: orderItemsCount } = await supabase
    .from("order_items")
    .select("*", { count: "exact", head: true });
  const { data: orderItemRows } = await supabase
    .from("order_items")
    .select("product_id");
  const productIdsWithOrders = [
    ...new Set((orderItemRows ?? []).map((r) => r.product_id)),
  ];
  const { count: productsCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  const { data: allProducts } = await supabase
    .from("products")
    .select("id, sku, cj_variant_id");

  const withOrderHistory =
    allProducts?.filter((p) => productIdsWithOrders.includes(p.id)) ?? [];
  const withoutOrderHistory =
    allProducts?.filter((p) => !productIdsWithOrders.includes(p.id)) ?? [];

  log.step1_safety = {
    orders: ordersCount ?? 0,
    order_items: orderItemsCount ?? 0,
    products_total: productsCount ?? 0,
    products_with_order_history: withOrderHistory.length,
    products_without_order_history: withoutOrderHistory.length,
    product_ids_with_orders: productIdsWithOrders,
  };

  console.log("STEP 1 — Safety check:", log.step1_safety);

  if (!process.env.CJ_API_KEY?.trim()) {
    throw new Error("CJ_API_KEY missing in .env.local");
  }

  const authUrl = `${CJ_API_BASE}/authentication/getAccessToken`;
  const authRes = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
  });
  const authBody = (await authRes.json()) as CJApiEnvelope<{
    accessToken: string;
  }>;
  log.api_calls.push({
    endpoint: "POST /authentication/getAccessToken",
    request: JSON.stringify({ apiKey: "[REDACTED]" }),
    response: { code: authBody.code, result: authBody.result, message: authBody.message },
  });

  if (authBody.code !== 200 || !authBody.data?.accessToken) {
    throw new Error(`CJ auth failed: ${authBody.message}`);
  }

  const headers = {
    "CJ-Access-Token": authBody.data.accessToken,
    "Content-Type": "application/json",
  };

  const { data: categories } = await supabase
    .from("categories")
    .select("id, slug");
  const categoryBySlug = new Map(
    (categories ?? []).map((c) => [c.slug, c.id])
  );

  let skuCounter = 121;
  const arvNumbers = (allProducts ?? [])
    .map((p) => /^ARV-(\d+)$/.exec(p.sku)?.[1])
    .filter((n): n is string => !!n)
    .map((n) => parseInt(n, 10));
  if (arvNumbers.length > 0) {
    skuCounter = Math.max(...arvNumbers) + 1;
  }

  const seenPids = new Set<string>();
  const toInsert: Array<Record<string, unknown>> = [];

  // STEP 2 — Pull from CJ (list for discovery, query for details, queryByVid for vid)
  for (const { slug, keywords } of CATEGORY_SEARCHES) {
    const categoryId = categoryBySlug.get(slug);
    if (!categoryId) {
      log.errors.push(`Missing category slug: ${slug}`);
      continue;
    }

    for (const keyword of keywords) {
      if (toInsert.length >= 16) break;

      const listUrl = `${CJ_API_BASE}/product/list?pageNum=1&pageSize=5&productNameEn=${encodeURIComponent(keyword)}&countryCode=US`;
      const listRes = await fetch(listUrl, { headers });
      const listBody = (await listRes.json()) as CJApiEnvelope<{
        list: CJListItem[];
      }>;

      log.api_calls.push({
        endpoint: "GET /product/list",
        request: listUrl.replace(CJ_API_BASE, ""),
        response: {
          code: listBody.code,
          message: listBody.message,
          total: (listBody.data as { total?: number })?.total,
          firstPid: listBody.data?.list?.[0]?.pid,
        },
      });

      if (listBody.code !== 200 || !listBody.data?.list?.length) {
        log.errors.push(`No list results for keyword: ${keyword}`);
        continue;
      }

      const candidate =
        listBody.data.list.find(
          (p) =>
            p.pid &&
            !seenPids.has(p.pid) &&
            p.productImage &&
            p.saleStatus === 3 &&
            matchesCategorySlug(slug, p.productNameEn, p.categoryName)
        ) ??
        listBody.data.list.find(
          (p) =>
            p.pid &&
            !seenPids.has(p.pid) &&
            p.productImage &&
            matchesCategorySlug(slug, p.productNameEn, p.categoryName)
        );

      if (!candidate?.pid) continue;
      seenPids.add(candidate.pid);

      const queryUrl = `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(candidate.pid)}&countryCode=US`;
      const queryRes = await fetch(queryUrl, { headers });
      const queryBody = (await queryRes.json()) as CJApiEnvelope<CJProductDetail>;

      log.api_calls.push({
        endpoint: "GET /product/query",
        request: queryUrl.replace(CJ_API_BASE, ""),
        response: {
          code: queryBody.code,
          message: queryBody.message,
          pid: queryBody.data?.pid,
          variantCount: queryBody.data?.variants?.length ?? 0,
          firstVid: queryBody.data?.variants?.[0]?.vid,
        },
      });

      if (queryBody.code !== 200 || !queryBody.data) {
        log.errors.push(`product/query failed for pid ${candidate.pid}`);
        continue;
      }

      const detail = queryBody.data;
      if (!detail.productNameEn || !matchesCategorySlug(slug, detail.productNameEn, detail.categoryName)) {
        log.errors.push(`Rejected pid ${candidate.pid} — category mismatch for ${slug}`);
        seenPids.delete(candidate.pid);
        continue;
      }

      const variantFromQuery = detail.variants?.find((v) => v.vid);
      if (!variantFromQuery?.vid) {
        log.errors.push(`No variant vid on product/query for pid ${candidate.pid}`);
        continue;
      }

      const vidUrl = `${CJ_API_BASE}/product/variant/queryByVid?vid=${encodeURIComponent(variantFromQuery.vid)}&features=enable_inventory`;
      const vidRes = await fetch(vidUrl, { headers });
      const vidBody = (await vidRes.json()) as CJApiEnvelope<CJVariant>;

      log.api_calls.push({
        endpoint: "GET /product/variant/queryByVid",
        request: vidUrl.replace(CJ_API_BASE, ""),
        response: {
          code: vidBody.code,
          message: vidBody.message,
          vid: vidBody.data?.vid,
          variantSellPrice: vidBody.data?.variantSellPrice,
        },
      });

      if (vidBody.code !== 200 || !vidBody.data?.vid) {
        log.errors.push(
          `variant/queryByVid failed for vid ${variantFromQuery.vid}`
        );
        continue;
      }

      const confirmedVariant = vidBody.data;
      const costPrice =
        parsePrice(confirmedVariant.variantSellPrice) ||
        parsePrice(variantFromQuery.variantSellPrice) ||
        parsePrice(detail.sellPrice) ||
        parsePrice(candidate.sellPrice);

      if (costPrice <= 0) {
        log.errors.push(`Could not parse cost price for pid ${candidate.pid}`);
        continue;
      }

      const retailPrice = Math.round(costPrice * MARKUP_MULTIPLIER * 100) / 100;
      const imageUrl =
        confirmedVariant.variantImage ||
        detail.bigImage ||
        detail.productImageSet?.[0] ||
        candidate.productImage;

      const stock =
        variantStock(variantFromQuery) ??
        variantStock(confirmedVariant) ??
        DEFAULT_STOCK;

      const sku = `ARV-${String(skuCounter).padStart(5, "0")}`;
      skuCounter++;

      const description = detail.description
        ? stripHtml(detail.description)
        : `${cleanTitle(detail.productNameEn)} — sourced from CJ Dropshipping.`;

      toInsert.push({
        category_id: categoryId,
        title: cleanTitle(detail.productNameEn || candidate.productNameEn),
        description,
        price_usd: retailPrice,
        image_url: imageUrl,
        sku,
        cj_product_id: detail.pid,
        cj_variant_id: confirmedVariant.vid,
        stock,
        sold_count: 0,
        is_active: true,
        _meta: {
          cj_cost_usd: costPrice,
          markup_multiplier: MARKUP_MULTIPLIER,
          stock_source:
            variantStock(variantFromQuery) != null ? "cj_inventory" : "placeholder_50",
          category_slug: slug,
          cj_category_name: detail.categoryName ?? candidate.categoryName,
        },
      });
    }
  }

  if (toInsert.length < 10) {
    throw new Error(
      `Only found ${toInsert.length} importable products (need 10–20). Check log.`
    );
  }

  // STEP 3 — Insert real products
  for (const row of toInsert) {
    const { _meta, ...insertRow } = row;
    const { data, error } = await supabase
      .from("products")
      .insert(insertRow)
      .select("id, title, price_usd, sku, cj_variant_id, category_id")
      .single();

    if (error || !data) {
      log.errors.push(`Insert failed ${insertRow.sku}: ${error?.message}`);
      continue;
    }

    const { data: cat } = await supabase
      .from("categories")
      .select("slug")
      .eq("id", data.category_id)
      .single();

    log.imported.push({
      title: data.title,
      price_usd: data.price_usd,
      cj_variant_id: data.cj_variant_id,
      cj_product_id: insertRow.cj_product_id,
      sku: data.sku,
      category: cat?.slug,
      ...(_meta as object),
    });
  }

  // STEP 4 — Remove placeholders
  for (const p of withOrderHistory) {
    await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", p.id);
    log.deactivated.push({
      id: p.id,
      sku: p.sku,
      reason: "order_history",
    });
  }

  if (withoutOrderHistory.length > 0) {
    const ids = withoutOrderHistory.map((p) => p.id);
    const { error } = await supabase.from("products").delete().in("id", ids);
    if (error) {
      log.errors.push(`Delete placeholders failed: ${error.message}`);
    } else {
      log.deleted_placeholder_count = ids.length;
    }
  }

  // STEP 5 — Verify
  const { data: activeReal } = await supabase
    .from("products")
    .select("id, title, price_usd, cj_variant_id, is_active, image_url, category_id")
    .eq("is_active", true)
    .not("cj_variant_id", "is", null);

  const { data: inactivePlaceholders } = await supabase
    .from("products")
    .select("id, sku, is_active, cj_variant_id")
    .eq("is_active", false);

  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

  console.log("\n=== IMPORT COMPLETE ===");
  console.log(`Imported: ${log.imported.length}`);
  console.log(`Deleted placeholders: ${log.deleted_placeholder_count}`);
  console.log(`Deactivated (order history): ${log.deactivated.length}`);
  console.log(`Active CJ products in DB: ${activeReal?.length ?? 0}`);
  console.log(`Inactive remnants: ${inactivePlaceholders?.length ?? 0}`);
  console.log(`Full API log: ${LOG_PATH}`);
  console.log("\nImported products:");
  console.table(
    log.imported.map((p) => ({
      title: (p.title as string)?.slice(0, 50),
      price_usd: p.price_usd,
      cj_variant_id: p.cj_variant_id,
      category: p.category,
      sku: p.sku,
    }))
  );

  if (log.errors.length) {
    console.warn("\nWarnings/errors:", log.errors);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
