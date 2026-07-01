/**
 * Import CJ leaf categories — run with: npm run import:cj-categories
 * Fetches GET /product/getCategory, flattens leaf categoryId/categoryName rows.
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { getCJAccessToken } from "../lib/cj";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const LOG_PATH = resolve(process.cwd(), "scripts/cj-categories-import-log.json");

type CJLeaf = { categoryId: string; categoryName: string };

type CJSecondGroup = {
  categorySecondName?: string;
  categorySecondList?: CJLeaf[];
};

type CJFirstGroup = {
  categoryFirstName?: string;
  categoryFirstList?: CJSecondGroup[];
};

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
};

type ImportLog = {
  leaf_count: number;
  inserted: number;
  updated: number;
  flagged_near_duplicates: Array<{
    cj_category_id: string;
    cj_name: string;
    matched_existing: string;
    reason: string;
  }>;
  errors: string[];
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s&/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(name: string): string[] {
  return normalizeName(name)
    .split(/[\s&/,]+/)
    .filter((t) => t.length >= 3);
}

function findNearDuplicate(
  cjName: string,
  existing: { name: string; slug: string }[]
): { matched: string; reason: string } | null {
  const normCj = normalizeName(cjName);

  for (const cat of existing) {
    const normEx = normalizeName(cat.name);

    if (normCj === normEx) {
      return { matched: cat.name, reason: "exact name match" };
    }

    if (
      normEx.length >= 4 &&
      (normCj.includes(normEx) || normEx.includes(normCj))
    ) {
      return {
        matched: cat.name,
        reason: `name substring overlap ("${normEx}" ↔ "${normCj}")`,
      };
    }

    const exTokens = tokenize(cat.name);
    const cjTokens = tokenize(cjName);
    const shared = exTokens.filter((t) => cjTokens.includes(t));
    if (
      shared.length > 0 &&
      shared.some((t) => t.length >= 5 || exTokens.includes(t))
    ) {
      const primary = shared.sort((a, b) => b.length - a.length)[0];
      if (primary.length >= 5 || exTokens.length === 1) {
        return {
          matched: cat.name,
          reason: `shared token "${primary}"`,
        };
      }
    }
  }

  return null;
}

function flattenLeaves(data: CJFirstGroup[]): CJLeaf[] {
  const leaves: CJLeaf[] = [];
  const seen = new Set<string>();

  for (const first of data) {
    for (const second of first.categoryFirstList ?? []) {
      for (const leaf of second.categorySecondList ?? []) {
        if (!leaf.categoryId || !leaf.categoryName) continue;
        if (seen.has(leaf.categoryId)) continue;
        seen.add(leaf.categoryId);
        leaves.push({
          categoryId: leaf.categoryId,
          categoryName: leaf.categoryName.trim(),
        });
      }
    }
  }

  return leaves;
}

async function main() {
  loadEnvLocal();

  const token = await getCJAccessToken();
  if (!token) {
    throw new Error("CJ auth failed — set CJ_API_KEY in .env.local");
  }

  const url = `${CJ_API_BASE}/product/getCategory`;
  const res = await fetch(url, { headers: { "CJ-Access-Token": token } });
  const body = (await res.json()) as CJApiEnvelope<CJFirstGroup[]>;

  if (body.code !== 200 || !body.data) {
    throw new Error(`getCategory failed: ${body.message}`);
  }

  const leaves = flattenLeaves(body.data);
  const log: ImportLog = {
    leaf_count: leaves.length,
    inserted: 0,
    updated: 0,
    flagged_near_duplicates: [],
    errors: [],
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: existingCategories } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order, cj_category_id")
    .order("sort_order", { ascending: true });

  const legacyEight = (existingCategories ?? []).filter((c) => !c.cj_category_id);
  const maxSort = Math.max(
    0,
    ...(existingCategories ?? []).map((c) => c.sort_order ?? 0)
  );

  const usedSlugs = new Set((existingCategories ?? []).map((c) => c.slug));
  let sortOrder = maxSort;

  const rowsToInsert: Array<{
    name: string;
    slug: string;
    cj_category_id: string;
    sort_order: number;
  }> = [];

  for (const leaf of leaves) {
    const nearDupe = findNearDuplicate(leaf.categoryName, legacyEight);
    if (nearDupe) {
      log.flagged_near_duplicates.push({
        cj_category_id: leaf.categoryId,
        cj_name: leaf.categoryName,
        matched_existing: nearDupe.matched,
        reason: nearDupe.reason,
      });
      continue;
    }

    let slug = slugify(leaf.categoryName);
    if (!slug) slug = `cj-${leaf.categoryId.slice(0, 8).toLowerCase()}`;
    let candidate = slug;
    let n = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${slug}-${n}`;
      n++;
    }
    slug = candidate;
    usedSlugs.add(slug);

    sortOrder += 1;
    rowsToInsert.push({
      name: leaf.categoryName,
      slug,
      cj_category_id: leaf.categoryId,
      sort_order: sortOrder,
    });
  }

  const existingCjIds = new Set(
    (existingCategories ?? [])
      .map((c) => c.cj_category_id)
      .filter((id): id is string => !!id)
  );

  const newRows = rowsToInsert.filter(
    (r) => !existingCjIds.has(r.cj_category_id)
  );
  log.updated = rowsToInsert.length - newRows.length;

  const BATCH = 100;
  for (let i = 0; i < newRows.length; i += BATCH) {
    const batch = newRows.slice(i, i + BATCH);
    const { error } = await supabase.from("categories").insert(batch);
    if (error) {
      log.errors.push(`Batch ${i / BATCH + 1}: ${error.message}`);
    } else {
      log.inserted += batch.length;
    }
  }

  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

  console.log("CJ leaf categories:", log.leaf_count);
  console.log("Inserted:", log.inserted);
  console.log("Updated (re-run):", log.updated);
  console.log("Flagged near-duplicates:", log.flagged_near_duplicates.length);
  console.log("Log:", LOG_PATH);

  if (log.flagged_near_duplicates.length) {
    console.log("\nNear-duplicates for review:");
    console.table(log.flagged_near_duplicates);
  }

  if (log.errors.length) {
    console.warn("\nErrors:", log.errors);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
