/** Known color names → hex fills for round swatches (light and dark safe). */
const NAMED_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  white: "#f0f0f0",
  gray: "#9ca3af",
  grey: "#9ca3af",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#ea580c",
  pink: "#ec4899",
  purple: "#9333ea",
  brown: "#92400e",
  beige: "#d4c4a8",
  navy: "#1e3a5f",
  gold: "#ca8a04",
  silver: "#a8a8a8",
  khaki: "#c3b091",
  cream: "#fffdd0",
  mint: "#98ff98",
  charcoal: "#36454f",
  ivory: "#fffff0",
  maroon: "#800000",
  teal: "#008080",
  coral: "#ff7f50",
  tan: "#d2b48c",
};

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Opt-in: only exact named colors or hex codes qualify for round color swatches. */
export function isRealColorName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (HEX_COLOR.test(trimmed)) return true;
  return Object.prototype.hasOwnProperty.call(
    NAMED_COLORS,
    trimmed.toLowerCase()
  );
}

/** Resolved fill for a confirmed real color; null if the label is not a color. */
export function resolveColorSwatchFill(color: string): string | null {
  if (!isRealColorName(color)) return null;
  const trimmed = color.trim();
  if (HEX_COLOR.test(trimmed)) return trimmed;
  return NAMED_COLORS[trimmed.toLowerCase()] ?? null;
}

export function formatVariantLabel(
  color: string | null,
  size: string | null
): string | null {
  const parts = [color, size].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(", ") : null;
}

export type SerializableVariant = {
  id: string;
  color: string | null;
  size: string | null;
  price_usd: number;
  shipping_cost_usd: number;
  stock: number;
  image_url: string | null;
  ships_from_country?: string | null;
  is_fast_shipping?: boolean;
};
