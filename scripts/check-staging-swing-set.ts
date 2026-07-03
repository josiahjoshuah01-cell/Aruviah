import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createServiceClient } from "../lib/supabase/admin";

const SWING_PID = "2072563742376099842";
const SWEATER_PID = "2511060704591611100";
const SKU = "CJYD258310312LO";

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
  const supabase = createServiceClient();

  const { data: staged, error: stagedErr } = await supabase
    .from("staged_products")
    .select(
      "id, cj_product_id, title, status, search_keyword, created_at, rejection_reason, variants"
    )
    .in("cj_product_id", [SWING_PID, SWEATER_PID])
    .order("created_at", { ascending: true });

  if (stagedErr) throw stagedErr;

  const { data: live, error: liveErr } = await supabase
    .from("products")
    .select("id, title, cj_product_id")
    .in("cj_product_id", [SWING_PID, SWEATER_PID]);

  if (liveErr) throw liveErr;

  const { data: pendingRelated, error: pendingErr } = await supabase
    .from("staged_products")
    .select("id, cj_product_id, title, status, search_keyword, created_at")
    .eq("status", "pending")
    .or(
      `cj_product_id.eq.${SWING_PID},cj_product_id.eq.${SWEATER_PID},search_keyword.ilike.%${SKU}%,title.ilike.%Swing Sets%,title.ilike.%Knitted Lapel Sweater%`
    )
    .order("created_at", { ascending: true });

  if (pendingErr) throw pendingErr;

  // Also scan pending rows whose variants json contains the SKU
  const { data: allPending, error: allPendingErr } = await supabase
    .from("staged_products")
    .select("id, cj_product_id, title, status, search_keyword, variants, created_at")
    .eq("status", "pending");

  if (allPendingErr) throw allPendingErr;

  const skuInVariants =
    allPending?.filter((row) => {
      const variants = row.variants as Array<{ cj_variant_id?: string }> | null;
      const json = JSON.stringify(variants ?? []);
      return json.includes(SKU);
    }) ?? [];

  let liveVariants: unknown[] = [];
  if (live?.length) {
    const { data: vars, error: varsErr } = await supabase
      .from("product_variants")
      .select("id, cj_variant_id, product_id, color, size")
      .in(
        "product_id",
        live.map((p) => p.id)
      );
    if (varsErr) throw varsErr;
    liveVariants = vars ?? [];
  }

  console.log(
    JSON.stringify(
      {
        stagedByPid: staged,
        liveProducts: live,
        liveVariants,
        pendingRelated,
        pendingWithSkuInVariants: skuInVariants.map((r) => ({
          id: r.id,
          cj_product_id: r.cj_product_id,
          title: r.title,
          status: r.status,
          search_keyword: r.search_keyword,
        })),
      },
      null,
      2
    )
  );

  const { data: swingAny } = await supabase
    .from("staged_products")
    .select("id, cj_product_id, title, status, search_keyword")
    .or(
      `cj_product_id.eq.${SWING_PID},title.ilike.%Swing Sets For Backyard%`
    );
  const { data: swingLive } = await supabase
    .from("products")
    .select("id, title, cj_product_id")
    .or(
      `cj_product_id.eq.${SWING_PID},title.ilike.%Swing Sets For Backyard%`
    );
  console.log(
    "swingSetAnywhere:",
    JSON.stringify({ staged: swingAny, live: swingLive }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
