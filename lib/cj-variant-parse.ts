/** Shared CJ variant label parsing for import / staging scripts. */

export function parsePrice(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const match = String(raw).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

export function cleanTitle(title: string): string {
  return title
    .replace(/\bfree shipping\b/gi, "")
    .replace(/\bhot sale\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

const SIZE_PATTERN =
  /\b(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|ONE\s*SIZE|OS)\b/i;

const SIZE_ONLY_PATTERN =
  /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|ONE\s*SIZE|OS)$/i;

const CAPACITY_PATTERN = /^\d+\s*(QT|L|ML|OZ|CM|IN|GB|TB)$/i;

export type CJVariantKey = {
  nameEn?: string;
  valueEn?: string;
  key?: string;
  value?: string;
};

export type CJVariantLike = {
  variantNameEn?: string;
  variantKey?: string;
  variantKeyEn?: string;
  variantProperty?: string;
  variantKeyList?: CJVariantKey[];
};

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

export function parseColorSize(v: CJVariantLike): {
  color: string | null;
  size: string | null;
} {
  let color: string | null = null;
  let size: string | null = null;

  for (const entry of v.variantKeyList ?? []) {
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
