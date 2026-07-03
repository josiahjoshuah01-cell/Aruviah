import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  buildFetchedCjProduct,
  getCjAccessToken,
  queryCjProductDetail,
  fetchCjVariantsByPid,
} from "../lib/cj-staging";
import { looksLikeVariantSku } from "../lib/cj-lookup";

const SKU = process.argv[2] ?? "CJYD258310312LO";

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
  console.log("looksLikeVariantSku:", looksLikeVariantSku(SKU));
  const token = await getCjAccessToken(process.env.CJ_API_KEY!);
  const headers = {
    "CJ-Access-Token": token,
    "Content-Type": "application/json",
  };

  const variantDetail = await queryCjProductDetail(headers, "variantSku", SKU);
  console.log(
    "variantSku query:",
    variantDetail
      ? { pid: variantDetail.pid, productSku: variantDetail.productSku, variants: variantDetail.variants?.length ?? 0 }
      : null
  );

  if (variantDetail?.pid) {
    const pid = variantDetail.pid;
    await new Promise((r) => setTimeout(r, 1200));
    const variantQueryUrl = `https://developers.cjdropshipping.com/api2.0/v1/product/variant/query?pid=${encodeURIComponent(pid)}&countryCode=US`;
    const vqRes = await fetch(variantQueryUrl, { headers });
    const vqBody = await vqRes.json();
    console.log("raw variant/query:", JSON.stringify({ status: vqRes.status, code: vqBody.code, message: vqBody.message, dataType: Array.isArray(vqBody.data) ? "array" : typeof vqBody.data, dataLen: Array.isArray(vqBody.data) ? vqBody.data.length : vqBody.data?.list?.length }, null, 2));

    await new Promise((r) => setTimeout(r, 1200));
    const pidQueryUrl = `https://developers.cjdropshipping.com/api2.0/v1/product/query?pid=${encodeURIComponent(pid)}&countryCode=US`;
    const pqRes = await fetch(pidQueryUrl, { headers });
    const pqBody = await pqRes.json();
    console.log("raw product/query?pid:", JSON.stringify({ status: pqRes.status, code: pqBody.code, variantCount: pqBody.data?.variants?.length, firstVid: pqBody.data?.variants?.[0]?.vid }, null, 2));

    await new Promise((r) => setTimeout(r, 1200));
    const vsUrl = `https://developers.cjdropshipping.com/api2.0/v1/product/query?variantSku=${encodeURIComponent(SKU)}&countryCode=US`;
    const vsRes = await fetch(vsUrl, { headers });
    const vsBody = await vsRes.json();
    const keys = vsBody.data ? Object.keys(vsBody.data).filter((k) => k.toLowerCase().includes("variant") || k.toLowerCase().includes("vid") || k.toLowerCase().includes("sku")) : [];
    console.log("variantSku response variant-related keys:", keys);
    console.log("variantSku data sample:", JSON.stringify(vsBody.data ? { pid: vsBody.data.pid, variantSku: vsBody.data.variantSku, vid: vsBody.data.vid, variants: vsBody.data.variants?.length } : null));

    await new Promise((r) => setTimeout(r, 1200));
    const productSkuUrl = `https://developers.cjdropshipping.com/api2.0/v1/product/query?productSku=${encodeURIComponent("CJYD2583103")}&countryCode=US`;
    const psRes = await fetch(productSkuUrl, { headers });
    const psBody = await psRes.json();
    console.log("raw product/query?productSku=CJYD2583103:", JSON.stringify({ code: psBody.code, variantCount: psBody.data?.variants?.length, firstVariantSku: psBody.data?.variants?.[0]?.variantSku }, null, 2));

    await new Promise((r) => setTimeout(r, 1200));
    const noCountryUrl = `https://developers.cjdropshipping.com/api2.0/v1/product/query?variantSku=${encodeURIComponent(SKU)}`;
    const ncRes = await fetch(noCountryUrl, { headers });
    const ncBody = await ncRes.json();
    console.log("product/query variantSku NO countryCode:", JSON.stringify({ code: ncBody.code, variantCount: ncBody.data?.variants?.length, firstVid: ncBody.data?.variants?.[0]?.vid, firstSku: ncBody.data?.variants?.[0]?.variantSku }, null, 2));

    await new Promise((r) => setTimeout(r, 1200));
    const vqNoCountry = `https://developers.cjdropshipping.com/api2.0/v1/product/variant/query?variantSku=${encodeURIComponent(SKU)}`;
    const vqNcRes = await fetch(vqNoCountry, { headers });
    const vqNcBody = await vqNcRes.json();
    console.log("variant/query variantSku NO countryCode:", JSON.stringify({ code: vqNcBody.code, dataLen: Array.isArray(vqNcBody.data) ? vqNcBody.data.length : null, first: vqNcBody.data?.[0]?.variantSku }, null, 2));

    const vars = await fetchCjVariantsByPid(headers, pid);
    console.log("variant/query by pid count:", vars.length);
    if (vars[0]) {
      console.log("first variant sample:", {
        vid: vars[0].vid,
        variantSku: vars[0].variantSku,
        variantSellPrice: vars[0].variantSellPrice,
      });
    }

    const built = await buildFetchedCjProduct(headers, variantDetail, null);
    console.log(
      "buildFetchedCjProduct:",
      built
        ? { variants: built.variants.length, title: built.detail.productNameEn }
        : null
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
