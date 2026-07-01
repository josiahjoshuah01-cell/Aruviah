import type { SupabaseClient } from "@supabase/supabase-js";
import { stageCjSearch, type StagedProductInsert } from "@/lib/cj-staging";
import { createServiceClient } from "@/lib/supabase/admin";

export type CjSearchSuccess = {
  ok: true;
  row: StagedProductInsert;
};

export type CjSearchFailure = {
  ok: false;
  error: string;
};

export type CjSearchResult = CjSearchSuccess | CjSearchFailure;

export type RunCjSearchOptions = {
  supabase?: SupabaseClient;
  cjApiKey?: string;
};

/**
 * Search CJ for a product matching keyword + category slug, then insert a pending
 * staged_products row. Shared by the admin UI and the CLI script.
 */
export async function runCjSearch(
  keyword: string,
  categorySlug: string,
  options: RunCjSearchOptions = {}
): Promise<CjSearchResult> {
  const trimmedKeyword = keyword.trim();
  const trimmedSlug = categorySlug.trim();

  if (!trimmedKeyword) {
    return { ok: false, error: "Search keyword is required." };
  }
  if (!trimmedSlug) {
    return { ok: false, error: "Category is required." };
  }

  const cjApiKey = options.cjApiKey ?? process.env.CJ_API_KEY?.trim();
  if (!cjApiKey) {
    return { ok: false, error: "CJ_API_KEY is not configured." };
  }

  try {
    const supabase = options.supabase ?? createServiceClient();
    const row = await stageCjSearch(
      supabase,
      trimmedKeyword,
      trimmedSlug,
      cjApiKey
    );
    return { ok: true, row };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "CJ search failed unexpectedly.";
    return { ok: false, error: message };
  }
}
