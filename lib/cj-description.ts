/**
 * CJ product descriptions arrive as HTML on /product/query `description`.
 * We normalize to simple markdown (## section headers) for storage + rendering.
 */

const SUPPLIER_LINE_PATTERNS: RegExp[] = [
  /\bthe belt is white\b/i,
  /\bactual (product|item) may (differ|vary)\b/i,
  /\bmay (differ|vary) from (the )?(picture|photo|image)\b/i,
  /\bdue to manual measurement\b/i,
  /\bplease allow\b.*\b(error|deviation|difference)\b/i,
  /\bcolor difference\b/i,
  /\bmonitor\b.*\bdisplay\b.*\bdiffer/i,
  /\bsupplier('s)?\s+(notice|disclaimer)\b/i,
  /\bwe will (ship|send)\b.*\b(random|substitut)/i,
  /\bsubstitut(e|ion)\b/i,
  /\bdefect\b.*\b(substitut|replace)/i,
  /\brandom (color|style)\b.*\bsent\b/i,
  /\bno choice of color\b/i,
  /\bopp bag\b/i,
  /\bnaked unit\b/i,
];

const KNOWN_SECTION_HEADERS =
  /^(overview|product information|size information|packing list|specification|specifications|features|material|note|notes|product image|product images)$/i;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

function isSupplierNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SUPPLIER_LINE_PATTERNS.some((re) => re.test(trimmed));
}

function looksLikeSectionHeader(label: string): boolean {
  const cleaned = label.replace(/:+$/, "").trim();
  if (!cleaned) return false;
  if (KNOWN_SECTION_HEADERS.test(cleaned)) return true;
  if (/information$/i.test(cleaned)) return true;
  if (/^packing\b/i.test(cleaned)) return true;
  return false;
}

function htmlToMarkdown(html: string): string {
  let s = html;

  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  s = s.replace(/<img[^>]*>/gi, "");

  s = s.replace(/<(?:b|strong)[^>]*>([^<]*)<\/(?:b|strong)>/gi, (_, raw) => {
    const text = decodeHtmlEntities(raw).trim();
    if (/^product images?$/i.test(text.replace(/:+$/, ""))) {
      return "\n\n## Product Image\n\n";
    }
    if (looksLikeSectionHeader(text) || /:$/.test(text)) {
      const heading = text.replace(/:+$/, "").trim();
      return `\n\n## ${heading}\n\n`;
    }
    return text ? `**${text}**` : "";
  });

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<p[^>]*>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<\/li>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeHtmlEntities(s);

  return s;
}

function dropProductImageSection(markdown: string): string {
  const idx = markdown.search(/^## Product Images?\s*$/im);
  if (idx === -1) return markdown;
  return markdown.slice(0, idx).trim();
}

function normalizeMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    if (isSupplierNoiseLine(line)) continue;
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Best-effort cleanup of CJ HTML description → markdown for staged_products.description.
 */
export function sanitizeCjDescription(
  raw: string | null | undefined,
  fallbackTitle: string,
  fallbackCategory?: string
): string {
  if (!raw?.trim()) {
    return `${fallbackTitle} — ${fallbackCategory ?? "Aruviah"}`;
  }

  const markdown = normalizeMarkdown(
    dropProductImageSection(htmlToMarkdown(raw))
  );

  if (!markdown) {
    return `${fallbackTitle} — ${fallbackCategory ?? "Aruviah"}`;
  }

  return markdown.slice(0, 12000);
}

export type ProductDescriptionSection = {
  heading: string | null;
  paragraphs: string[];
};

/** Parse stored markdown description into renderable sections. */
export function parseProductDescription(
  content: string
): ProductDescriptionSection[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  if (!/^## /m.test(trimmed)) {
    const paragraphs = trimmed
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, " ").trim())
      .filter(Boolean);
    return [{ heading: null, paragraphs }];
  }

  const chunks = trimmed.split(/\n(?=## )/);
  const sections: ProductDescriptionSection[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    let heading: string | null = null;
    const bodyLines: string[] = [];

    if (lines[0]?.startsWith("## ")) {
      heading = lines[0].replace(/^##\s+/, "").trim();
      bodyLines.push(...lines.slice(1));
    } else {
      bodyLines.push(...lines);
    }

    const body = bodyLines.join("\n").trim();
    let paragraphs: string[];

    if (body.includes("\n") && !/\n\n/.test(body)) {
      paragraphs = body
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    } else {
      paragraphs = body
        .split(/\n{2,}|\n(?=- )/)
        .map((p) =>
          p
            .replace(/^- /gm, "• ")
            .replace(/\n/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim()
        )
        .filter(Boolean);
    }

    if (heading || paragraphs.length > 0) {
      sections.push({ heading, paragraphs });
    }
  }

  return sections;
}
