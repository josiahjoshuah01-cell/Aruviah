import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  CJ_ACCESS_TOKEN_REFRESH_BEFORE_MS,
  __cjAuthTest,
  getCJToken,
  shouldRefreshAccessToken,
  shouldUseCachedAccessToken,
} from "../lib/cj";

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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

function runUnitTests() {
  console.log("--- Unit: expiry-driven cache decisions ---\n");

  const now = Date.parse("2026-07-01T12:00:00.000Z");
  const base = {
    accessToken: "access",
    refreshToken: "refresh",
    refreshTokenExpiryDate: "2026-12-01T12:00:00.000Z",
    fetchedAt: now,
  };

  const fresh = {
    ...base,
    accessTokenExpiryDate: "2026-07-20T12:00:00.000Z",
  };
  assert(
    shouldUseCachedAccessToken(fresh, now),
    "19 days remaining: should reuse cache"
  );
  assert(
    !shouldRefreshAccessToken(fresh, now),
    "19 days remaining: should not refresh"
  );

  const nearExpiry = {
    ...base,
    accessTokenExpiryDate: "2026-07-02T18:00:00.000Z",
  };
  assert(
    !shouldUseCachedAccessToken(nearExpiry, now),
    "30h remaining: should not blindly reuse"
  );
  assert(
    shouldRefreshAccessToken(nearExpiry, now),
    "30h remaining (<48h): should refresh proactively"
  );

  const expiredAccess = {
    ...base,
    accessTokenExpiryDate: "2026-06-30T12:00:00.000Z",
  };
  assert(
    !shouldUseCachedAccessToken(expiredAccess, now),
    "expired access: should not reuse"
  );
  assert(
    shouldRefreshAccessToken(expiredAccess, now),
    "expired access + valid refresh: should refresh"
  );

  const expiredRefresh = {
    ...base,
    accessTokenExpiryDate: "2026-06-30T12:00:00.000Z",
    refreshTokenExpiryDate: "2026-06-29T12:00:00.000Z",
  };
  assert(
    !shouldRefreshAccessToken(expiredRefresh, now),
    "expired refresh: should not call refreshAccessToken"
  );

  console.log("All unit checks passed.\n");
}

async function runIntegrationTest() {
  console.log("--- Integration: near-expiry triggers refreshAccessToken ---\n");

  if (!process.env.CJ_API_KEY?.trim()) {
    console.log("CJ_API_KEY missing — skipping live refresh test.");
    return;
  }

  __cjAuthTest.reset();

  const token = await getCJToken();
  assert(!!token, "initial getCJToken failed");

  const cache = __cjAuthTest.getCache();
  assert(!!cache, "cache missing after getCJToken");
  console.log("CJ returned accessTokenExpiryDate:", cache!.accessTokenExpiryDate);
  console.log("CJ returned refreshTokenExpiryDate:", cache!.refreshTokenExpiryDate);

  const authCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/authentication/")) {
      authCalls.push(url);
    }
    return originalFetch(input, init);
  };

  try {
    __cjAuthTest.setCache({
      ...cache!,
      accessTokenExpiryDate: hoursFromNow(36),
    });

    assert(
      shouldRefreshAccessToken(__cjAuthTest.getCache()!),
      "synthetic 36h expiry should be within refresh window"
    );

    const resolved = await __cjAuthTest.resolveCJAccessToken();
    assert(!!resolved, "resolveCJAccessToken returned null");

    const usedRefresh = authCalls.some((u) =>
      u.includes("/authentication/refreshAccessToken")
    );
    const usedFullAuth = authCalls.some((u) =>
      u.includes("/authentication/getAccessToken")
    );

    console.log("Auth endpoints called:", authCalls.map((u) => u.split("/v1")[1]));
    assert(usedRefresh, "expected refreshAccessToken to be called");
    assert(!usedFullAuth, "did not expect getAccessToken fallback");

    const updated = __cjAuthTest.getCache();
    console.log("After refresh accessTokenExpiryDate:", updated?.accessTokenExpiryDate);
    console.log("\nIntegration refresh path: OK");
  } finally {
    globalThis.fetch = originalFetch;
    __cjAuthTest.reset();
  }
}

async function main() {
  loadEnvLocal();
  console.log(
    `Refresh-before window: ${CJ_ACCESS_TOKEN_REFRESH_BEFORE_MS / (60 * 60 * 1000)}h\n`
  );
  runUnitTests();
  await runIntegrationTest();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
