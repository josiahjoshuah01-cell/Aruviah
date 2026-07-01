import type { SearchParams } from "@/lib/validations";

export function buildCatalogHref(
  basePath: string,
  current: SearchParams,
  patch: Partial<SearchParams> & { clear?: (keyof SearchParams)[] }
): string {
  const next: SearchParams = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (key === "clear") continue;
    if (value === undefined || value === "") {
      delete next[key as keyof SearchParams];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }

  if (patch.clear) {
    for (const key of patch.clear) {
      delete next[key];
    }
  }

  const sp = new URLSearchParams();
  if (current.q) sp.set("q", current.q);
  if (next.size) sp.set("size", next.size);
  if (next.minPrice != null) sp.set("minPrice", String(next.minPrice));
  if (next.maxPrice != null) sp.set("maxPrice", String(next.maxPrice));
  if (next.sort) sp.set("sort", next.sort);

  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function catalogClearAllHref(basePath: string, current: SearchParams): string {
  const sp = new URLSearchParams();
  if (current.q) sp.set("q", current.q);
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
