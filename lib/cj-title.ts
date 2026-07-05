/**
 * CJ productNameEn values are often run-on marketing copy with OCR typos.
 * sanitizeCjTitle() produces a concise storefront display title.
 */

const DEFAULT_MAX_TITLE_LENGTH = 75;

/** Letter-space-brand OCR splits common in CJ automotive/electronics titles. */
const BRAND_SPLIT_FIXES: ReadonlyArray<[RegExp, string]> = [
  [/\bT\s+Oyota\b/gi, "Toyota"],
  [/\bB\s+MW\b/gi, "BMW"],
  [/\bH\s+onda\b/gi, "Honda"],
  [/\bN\s+issan\b/gi, "Nissan"],
  [/\bM\s+azda\b/gi, "Mazda"],
  [/\bH\s+yundai\b/gi, "Hyundai"],
  [/\bK\s+ia\b/gi, "Kia"],
  [/\bL\s+exus\b/gi, "Lexus"],
  [/\bS\s+ubaru\b/gi, "Subaru"],
  [/\bC\s+hevrolet\b/gi, "Chevrolet"],
  [/\bV\s+olkswagen\b/gi, "Volkswagen"],
  [/\bM\s+ercedes\b/gi, "Mercedes"],
  [/\bS\s+amsung\b/gi, "Samsung"],
  [/\bL\s+G\b/gi, "LG"],
];

const MARKETING_FILLER_PATTERNS: RegExp[] = [
  /\bfree shipping\b/gi,
  /\bhot sale\b/gi,
  /\bwholesale\b/gi,
  /\bhigh[\s-]?quality\b/gi,
  /\btop[\s-]?quality\b/gi,
  /\bbest seller\b/gi,
  /\bnew arrival\b/gi,
  /\bfactory direct\b/gi,
  /\b\d{4}\s+new\b/gi,
];

const ORIGINAL_TITLE_MARKER = "**Original CJ listing title:**";

function normalizeWhitespace(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

function fixBrandSplitArtifacts(title: string): string {
  let out = title;
  for (const [pattern, replacement] of BRAND_SPLIT_FIXES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function stripMarketingFiller(title: string): string {
  let out = title;
  for (const pattern of MARKETING_FILLER_PATTERNS) {
    out = out.replace(pattern, " ");
  }
  return normalizeWhitespace(out.replace(/\s+,/g, ",").replace(/,\s*,/g, ","));
}

function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxLen * 0.45)) {
    return slice.slice(0, lastSpace).replace(/[,\-–—]\s*$/, "").trim();
  }

  return slice.replace(/[,\-–—]\s*$/, "").trim();
}

function compactLongTitle(title: string, maxLen: number): string {
  if (title.length <= maxLen) return title;

  const commaParts = title.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length > 1) {
    let acc = commaParts[0];
    for (let i = 1; i < commaParts.length; i++) {
      const candidate = `${acc}, ${commaParts[i]}`;
      if (candidate.length > maxLen) break;
      acc = candidate;
    }
    if (acc.length <= maxLen) return acc;
    if (acc.length > maxLen) return truncateAtWordBoundary(acc, maxLen);
  }

  return truncateAtWordBoundary(title, maxLen);
}

/**
 * Sanitize a raw CJ productNameEn for catalog cards, nav, and listing titles.
 */
export function sanitizeCjTitle(
  raw: string | null | undefined,
  maxLen = DEFAULT_MAX_TITLE_LENGTH
): string {
  if (!raw?.trim()) return "Product";

  let title = normalizeWhitespace(raw);
  title = fixBrandSplitArtifacts(title);
  title = stripMarketingFiller(title);
  title = compactLongTitle(title, maxLen);

  return title || "Product";
}

/** True when sanitization materially changed the raw CJ title. */
export function cjTitleWasSanitized(
  raw: string | null | undefined,
  sanitized: string
): boolean {
  return normalizeWhitespace(raw ?? "") !== normalizeWhitespace(sanitized);
}

/**
 * Preserve the full CJ title in description when the display title was shortened or cleaned.
 */
export function appendOriginalTitleToDescription(
  description: string,
  rawTitle: string,
  sanitizedTitle: string
): string {
  const original = normalizeWhitespace(rawTitle);
  if (!original || !cjTitleWasSanitized(rawTitle, sanitizedTitle)) {
    return description;
  }
  if (description.includes(ORIGINAL_TITLE_MARKER) || description.includes(original)) {
    return description;
  }

  const block = `\n\n---\n${ORIGINAL_TITLE_MARKER} ${original}`;
  return `${description.trim()}${block}`;
}

export { DEFAULT_MAX_TITLE_LENGTH };
