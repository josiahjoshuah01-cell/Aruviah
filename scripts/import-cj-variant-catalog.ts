/**
 * Import 10 CJ products (one per category niche) with real color/size variants.
 * Run: npm run import:cj-variants
 *
 * Does NOT delete existing catalog — adds new products + product_variants rows.
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { enrichCjVariants } from "../lib/cj-staging";
import {
  resolveVariantShipsFromCountry,
  variantIsFastShipping,
} from "../lib/cj-shipping-origin";
import type { CJStockRow } from "../lib/cj-shipping-origin";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const MARKUP_MULTIPLIER = 2;
const DEFAULT_STOCK = 50;
const MIN_VARIANTS = 2;
const TARGET_COUNT = 10;
const LOG_PATH = resolve(process.cwd(), "scripts/cj-variant-import-log.json");

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
};

type CJListItem = {
  pid: string;
  productNameEn: string;
  productImage: string;
  sellPrice: string | number;
  categoryName?: string;
  saleStatus?: number;
};

type CJVariantKey = {
  nameEn?: string;
  valueEn?: string;
  key?: string;
  value?: string;
};

type CJVariant = {
  vid: string;
  pid: string;
  variantNameEn?: string;
  variantSku?: string;
  variantImage?: string;
  variantSellPrice?: number | string;
  variantKey?: string;
  variantKeyEn?: string;
  variantProperty?: string;
  variantStandard?: string;
  variantKeyList?: CJVariantKey[];
  freight?: number | string;
  inventories?: Array<{ totalInventory?: number; countryCode?: string }>;
  _stockRows?: CJStockRow[];
};

type CJProductDetail = {
  pid: string;
  productNameEn: string;
  bigImage?: string;
  productImageSet?: string[];
  sellPrice?: number | string;
  description?: string;
  categoryName?: string;
  categoryId?: string;
  variants?: CJVariant[];
};

/** 10 distinct category niches → legacy store category slug */
const CATEGORY_TARGETS: {
  slug: string;
  keywords: string[];
  cjCategoryHints: string[];
}[] = [
  {
    slug: "beauty",
    keywords: [
      "lipstick set",
      "eyeshadow palette",
      "makeup brush set",
      "nail polish kit",
      "face serum",
      "lip gloss",
      "foundation makeup",
    ],
    cjCategoryHints: ["beauty", "makeup", "skin", "cosmetic", "nail", "hair"],
  },
  {
    slug: "toys",
    keywords: ["plush toy", "building blocks", "kids puzzle"],
    cjCategoryHints: ["toy", "kids", "game"],
  },
  {
    slug: "sports",
    keywords: [
      "yoga mat",
      "resistance bands set",
      "dumbbell",
      "jump rope",
      "running shorts",
      "sports bra",
      "cycling gloves",
      "fitness leggings",
    ],
    cjCategoryHints: ["sport", "fitness", "outdoor", "cycling", "running", "gym"],
  },
  {
    slug: "garden",
    keywords: ["garden tool", "plant pot", "watering can"],
    cjCategoryHints: ["garden", "plant", "lawn"],
  },
  {
    slug: "electronics",
    keywords: ["wireless earbuds", "phone case", "usb c cable"],
    cjCategoryHints: ["electronic", "phone", "computer"],
  },
  {
    slug: "home",
    keywords: ["throw blanket", "storage basket", "wall clock"],
    cjCategoryHints: ["home", "furniture", "decor"],
  },
  {
    slug: "kitchen",
    keywords: ["kitchen knife", "coffee mug", "cutting board"],
    cjCategoryHints: ["kitchen", "cook", "dining"],
  },
  {
    slug: "fashion",
    keywords: ["women hoodie", "men t-shirt", "casual dress"],
    cjCategoryHints: ["clothing", "fashion", "women", "men"],
  },
  {
    slug: "fashion",
    keywords: ["crossbody bag", "leather wallet", "sunglasses"],
    cjCategoryHints: ["bag", "shoes", "accessor"],
  },
  {
    slug: "electronics",
    keywords: ["smart watch", "bluetooth speaker", "power bank"],
    cjCategoryHints: ["watch", "speaker", "charger"],
  },
];

const SLUG_TERMS: Record<string, string[]> = {
  electronics: ["electronic", "earphone", "headphone", "bluetooth", "usb", "phone", "power", "smart", "watch", "speaker", "charger", "cable"],
  home: ["home", "blanket", "pillow", "storage", "basket", "clock", "decor", "furniture", "organizer", "lamp", "pet"],
  kitchen: ["kitchen", "mug", "knife", "cutting", "cook", "pot", "pan", "spatula", "dining"],
  fashion: ["fashion", "shirt", "hoodie", "bag", "dress", "clothing", "women", "men", "wallet", "sunglass", "shoe"],
  beauty: ["beauty", "makeup", "skin", "lip", "serum", "brush", "cosmetic"],
  toys: ["toy", "kids", "puzzle", "plush", "game", "blocks"],
  sports: ["sport", "fitness", "yoga", "gym", "outdoor", "resistance"],
  garden: ["garden", "plant", "lawn", "watering", "pot"],
};

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
    .slice(0, 2000);
}

function matchesSlug(slug: string, productName: string, cjCategory?: string): boolean {
  const terms = SLUG_TERMS[slug] ?? [];
  const haystack = `${productName} ${cjCategory ?? ""}`.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

function matchesCjHints(hints: string[], cjCategory?: string): boolean {
  if (!cjCategory) return true;
  const hay = cjCategory.toLowerCase();
  return hints.some((h) => hay.includes(h.toLowerCase()));
}

function variantStock(v: CJVariant): number {
  const inv = v.inventories?.[0]?.totalInventory;
  if (typeof inv === "number" && inv > 0) return inv;
  return DEFAULT_STOCK;
}

const SIZE_PATTERN =
  /\b(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|ONE\s*SIZE|OS)\b/i;

const SIZE_ONLY_PATTERN =
  /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|ONE\s*SIZE|OS)$/i;

const CAPACITY_PATTERN = /^\d+\s*(QT|L|ML|OZ|CM|IN|GB|TB)$/i;

function parseVariantKey(raw: string): { color: string | null; size: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { color: null, size: null };

  if (SIZE_ONLY_PATTERN.test(trimmed)) {
    return { color: null, size: trimmed.toUpperCase().replace(/\s+/g, "") };
  }

  const dashMatch = trimmed.match(
    /^(.+?)-((?:XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|ONE\s*SIZE|OS))$/i
  );
  if (dashMatch) {
    return {
      color: dashMatch[1].trim(),
      size: dashMatch[2].toUpperCase().replace(/\s+/g, ""),
    };
  }

  if (CAPACITY_PATTERN.test(trimmed)) {
    return { color: null, size: trimmed.toUpperCase() };
  }

  return { color: trimmed, size: null };
}

function parseColorSize(v: CJVariant): { color: string | null; size: string | null } {
  let color: string | null = null;
  let size: string | null = null;

  const keyList = v.variantKeyList ?? [];
  for (const entry of keyList) {
    const name = (entry.nameEn ?? entry.key ?? "").toLowerCase();
    const val = (entry.valueEn ?? entry.value ?? "").trim();
    if (!val) continue;
    if (/color|colour/i.test(name)) color = val;
    if (/size/i.test(name)) size = val;
  }

  const keyBlob = `${v.variantKeyEn ?? ""} ${v.variantKey ?? ""} ${v.variantProperty ?? ""}`;
  if (!color) {
    const m = keyBlob.match(/color[-:\s]+([^;,]+)/i);
    if (m) color = m[1].trim();
  }
  if (!size) {
    const m = keyBlob.match(/size[-:\s]+([^;,]+)/i);
    if (m) size = m[1].trim();
  }

  const rawKey = (v.variantKey ?? v.variantKeyEn ?? "").trim();
  if (rawKey) {
    const fromKey = parseVariantKey(rawKey);
    color = color ?? fromKey.color;
    size = size ?? fromKey.size;
  }

  const name = v.variantNameEn ?? "";
  if (!size) {
    const sm = name.match(SIZE_PATTERN);
    if (sm) size = sm[1].toUpperCase().replace(/\s+/g, "");
  }

  if (!color && name) {
    const parts = name.split(/[\/\-,]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (SIZE_PATTERN.test(last)) {
        size = size ?? last.toUpperCase();
        color = color ?? (parts.slice(0, -1).join(" ").trim() || null);
      } else if (!color) {
        color = parts[0];
        if (parts[1] && SIZE_PATTERN.test(parts[1])) size = parts[1].toUpperCase();
      }
    }
  }

  return {
    color: color || null,
    size: size ? size.toUpperCase() : null,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function backfillVariantLabels(
  supabase: ReturnType<typeof createClient>,
  headers: Record<string, string>,
  minSku: string
) {
  const { data: rows, error } = await supabase
    .from("product_variants")
    .select("id, sku, cj_variant_id, color, size")
    .gte("sku", minSku)
    .not("cj_variant_id", "is", null)
    .order("sku");

  if (error) throw error;
  let updated = 0;

  const variantRows = (rows ?? []) as Array<{
    id: string;
    sku: string;
    cj_variant_id: string | null;
    color: string | null;
    size: string | null;
  }>;

  for (const row of variantRows) {
    if (!row.cj_variant_id) continue;
    await sleep(150);
    const vidUrl = `${CJ_API_BASE}/product/variant/queryByVid?vid=${encodeURIComponent(row.cj_variant_id)}&features=enable_inventory`;
    const vidBody = (await fetch(vidUrl, { headers }).then((r) => r.json())) as CJApiEnvelope<CJVariant>;
    if (vidBody.code !== 200 || !vidBody.data) continue;

    const { color, size } = parseColorSize(vidBody.data);
    if (color === row.color && size === row.size) continue;

    const { error: updateError } = await supabase
      .from("product_variants")
      .update({ color, size })
      .eq("id", row.id);

    if (!updateError) {
      updated++;
      console.log(`${row.sku}: color=${color ?? "—"} size=${size ?? "—"}`);
    }
  }

  console.log(`\nBackfill complete: ${updated}/${rows?.length ?? 0} variants updated`);
}

async function main() {
  loadEnvLocal();
  if (!process.env.CJ_API_KEY?.trim()) {
    throw new Error("CJ_API_KEY missing in .env.local");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const authRes = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
  });
  const authBody = (await authRes.json()) as CJApiEnvelope<{ accessToken: string }>;
  if (authBody.code !== 200 || !authBody.data?.accessToken) {
    throw new Error(`CJ auth failed: ${authBody.message}`);
  }

  const headers = {
    "CJ-Access-Token": authBody.data.accessToken,
    "Content-Type": "application/json",
  };

  const backfillArg = process.argv.find((a) => a.startsWith("--backfill-from="));
  if (backfillArg) {
    await backfillVariantLabels(supabase, headers, backfillArg.slice("--backfill-from=".length));
    return;
  }

  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlySlugs = onlyArg
    ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const activeTargets = onlySlugs
    ? CATEGORY_TARGETS.filter((t) => onlySlugs.includes(t.slug))
    : CATEGORY_TARGETS;
  const targetCount = onlySlugs ? activeTargets.length : TARGET_COUNT;

  if (activeTargets.length === 0) {
    throw new Error(
      `No matching category targets for --only=${onlySlugs?.join(",") ?? ""}`
    );
  }

  const log: Record<string, unknown> = {
    imported: [] as unknown[],
    errors: [] as string[],
    api_calls: 0,
  };

  const { data: categories } = await supabase.from("categories").select("id, slug");
  const categoryBySlug = new Map((categories ?? []).map((c) => [c.slug, c.id]));

  const { data: existingSkus } = await supabase
    .from("product_variants")
    .select("sku");
  const arvNumbers = (existingSkus ?? [])
    .map((r) => /^ARV-(\d+)$/.exec(r.sku)?.[1])
    .filter((n): n is string => !!n)
    .map((n) => parseInt(n, 10));
  let skuCounter = arvNumbers.length > 0 ? Math.max(...arvNumbers) + 1 : 200;

  const seenPids = new Set<string>();
  const { data: existingProducts } = await supabase
    .from("products")
    .select("cj_product_id");
  for (const row of existingProducts ?? []) {
    if (row.cj_product_id) seenPids.add(row.cj_product_id);
  }

  let importedCount = 0;

  for (const target of activeTargets) {
    if (!onlySlugs && importedCount >= targetCount) break;

    const categoryId = categoryBySlug.get(target.slug);
    if (!categoryId) {
      (log.errors as string[]).push(`Missing category slug: ${target.slug}`);
      continue;
    }

    let picked: {
      detail: CJProductDetail;
      variants: CJVariant[];
      cjCategoryName: string;
    } | null = null;

    for (const keyword of target.keywords) {
      if (picked) break;

      for (let pageNum = 1; pageNum <= 3 && !picked; pageNum++) {
        const listUrl = `${CJ_API_BASE}/product/list?pageNum=${pageNum}&pageSize=20&productNameEn=${encodeURIComponent(keyword)}&countryCode=US`;
        const listRes = await fetch(listUrl, { headers });
        const listBody = (await listRes.json()) as CJApiEnvelope<{ list: CJListItem[] }>;
        (log.api_calls as number)++;

        if (listBody.code !== 200 || !listBody.data?.list?.length) continue;

        for (const candidate of listBody.data.list) {
        if (!candidate.pid || seenPids.has(candidate.pid) || !candidate.productImage) {
          continue;
        }

        await sleep(300);
        const queryUrl = `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(candidate.pid)}&countryCode=US`;
        const queryRes = await fetch(queryUrl, { headers });
        const queryBody = (await queryRes.json()) as CJApiEnvelope<CJProductDetail>;
        (log.api_calls as number)++;

        const detail = queryBody.data;
        if (queryBody.code !== 200 || !detail?.variants?.length) continue;

        const cjCategoryName = detail.categoryName ?? candidate.categoryName ?? "";
        const slugOk = matchesSlug(target.slug, detail.productNameEn, cjCategoryName);
        const hintOk = matchesCjHints(target.cjCategoryHints, cjCategoryName);
        if (!slugOk && !hintOk) continue;

        if (detail.variants.length < MIN_VARIANTS) continue;

        const enrichedVariants = await enrichCjVariants(
          headers,
          detail,
          detail.variants
        );

        const withPrice = enrichedVariants.filter(
          (v) =>
            parsePrice(v.variantSellPrice) > 0 || parsePrice(detail.sellPrice) > 0
        );
        if (withPrice.length < MIN_VARIANTS) continue;

        seenPids.add(candidate.pid);
        picked = {
          detail,
          variants: withPrice,
          cjCategoryName,
        };
        break;
      }
      }
    }

    if (!picked) {
      (log.errors as string[]).push(
        `No multi-variant product found for category target: ${target.slug}`
      );
      continue;
    }

    const coverImage =
      picked.detail.bigImage ||
      picked.detail.productImageSet?.[0] ||
      picked.variants[0]?.variantImage ||
      null;

    const description = picked.detail.description
      ? stripHtml(picked.detail.description)
      : `${cleanTitle(picked.detail.productNameEn)} — ${picked.cjCategoryName}`;

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        category_id: categoryId,
        title: cleanTitle(picked.detail.productNameEn),
        description,
        image_url: coverImage,
        cj_product_id: picked.detail.pid,
        sold_count: 0,
        is_active: true,
      })
      .select("id, title")
      .single();

    if (productError || !product) {
      (log.errors as string[]).push(
        `Product insert failed (${target.slug}): ${productError?.message}`
      );
      continue;
    }

    const variantRows: Array<Record<string, unknown>> = [];
    for (const v of picked.variants) {
      const cost =
        parsePrice(v.variantSellPrice) || parsePrice(picked.detail.sellPrice);
      if (cost <= 0) continue;

      const { color, size } = parseColorSize(v);
      const sku = `ARV-${String(skuCounter).padStart(5, "0")}`;
      skuCounter++;

      const shipsFrom = resolveVariantShipsFromCountry(
        v.inventories,
        v._stockRows,
        null
      );
      if (!shipsFrom) {
        continue;
      }

      variantRows.push({
        product_id: product.id,
        cj_variant_id: v.vid,
        color,
        size,
        sku,
        price_usd: Math.round(cost * MARKUP_MULTIPLIER * 100) / 100,
        shipping_cost_usd: Math.round(parsePrice(v.freight) * 100) / 100,
        stock: variantStock(v),
        image_url: v.variantImage || coverImage,
        is_active: true,
        ships_from_country: shipsFrom,
        is_fast_shipping: variantIsFastShipping(shipsFrom),
      });
    }

    if (variantRows.length < MIN_VARIANTS) {
      await supabase.from("products").delete().eq("id", product.id);
      (log.errors as string[]).push(
        `Too few priced variants with resolved warehouse origin for ${picked.detail.pid}, rolled back`
      );
      continue;
    }

    const { error: variantError } = await supabase
      .from("product_variants")
      .insert(variantRows);

    if (variantError) {
      await supabase.from("products").delete().eq("id", product.id);
      (log.errors as string[]).push(
        `Variant insert failed: ${variantError.message}`
      );
      continue;
    }

    importedCount++;
    (log.imported as unknown[]).push({
      product_id: product.id,
      title: product.title,
      category_slug: target.slug,
      cj_category: picked.cjCategoryName,
      cj_product_id: picked.detail.pid,
      variant_count: variantRows.length,
      colors: [...new Set(variantRows.map((r) => r.color).filter(Boolean))],
      sizes: [...new Set(variantRows.map((r) => r.size).filter(Boolean))],
      skus: variantRows.map((r) => r.sku),
    });

    console.log(
      `[${importedCount}/${targetCount}] ${product.title.slice(0, 50)} — ${variantRows.length} variants (${target.slug})`
    );
  }

  const newImported = [...(log.imported as unknown[])];
  const newErrors = [...(log.errors as string[])];
  const priorLog = existsSync(LOG_PATH)
    ? (JSON.parse(readFileSync(LOG_PATH, "utf8")) as {
        imported?: unknown[];
        errors?: string[];
        api_calls?: number;
      })
    : null;
  if (priorLog && onlySlugs) {
    log.imported = [...(priorLog.imported ?? []), ...newImported];
    log.errors = [
      ...(priorLog.errors ?? []).filter(
        (e) => !onlySlugs.some((s) => e.includes(s))
      ),
      ...newErrors,
    ];
    (log.api_calls as number) += priorLog.api_calls ?? 0;
  }

  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

  console.log("\n=== VARIANT IMPORT COMPLETE ===");
  console.log(`Imported products: ${importedCount}`);
  console.log(`Log: ${LOG_PATH}`);
  if ((log.errors as string[]).length) {
    console.warn("Errors:", log.errors);
  }

  if (importedCount < targetCount) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
