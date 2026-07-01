/** Map common color names to swatch fills — works in light and dark mode. */
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
};

export function colorSwatchFill(color: string): string {
  return NAMED_COLORS[color.trim().toLowerCase()] ?? "#9ca3af";
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
};
