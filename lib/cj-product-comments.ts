const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

type CJApiEnvelope<T> = {
  code: number;
  result?: boolean;
  success?: boolean;
  message?: string;
  data?: T;
};

type CJCommentRow = {
  score?: string | number;
};

type CJCommentsPage = {
  total?: string | number;
  list?: CJCommentRow[];
};

export type CjReviewSummary = {
  count: number;
  avgScore: number | null;
};

function parseScore(raw: string | number | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * CJ supplier review summary from GET /product/productComments.
 * Uses `total` for count; average from first page of scores (up to 100).
 */
export async function fetchCjProductReviewSummary(
  headers: Record<string, string>,
  pid: string
): Promise<CjReviewSummary | null> {
  try {
    const url = `${CJ_API_BASE}/product/productComments?pid=${encodeURIComponent(pid)}&pageNum=1&pageSize=100`;
    const res = await fetch(url, { headers });
    const body = (await res.json()) as CJApiEnvelope<CJCommentsPage>;

    const ok =
      res.ok &&
      (body.code === 200 || body.code === 0) &&
      body.result !== false &&
      body.success !== false;

    if (!ok || !body.data) return null;

    const count = parseInt(String(body.data.total ?? "0"), 10);
    const scores = (body.data.list ?? [])
      .map((row) => parseScore(row.score))
      .filter((s): s is number => s != null);

    if (!Number.isFinite(count) || count <= 0) {
      return { count: 0, avgScore: null };
    }

    const avgScore =
      scores.length > 0
        ? Math.round(
            (scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10
          ) / 10
        : null;

    return { count, avgScore };
  } catch {
    return null;
  }
}
