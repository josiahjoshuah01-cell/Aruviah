/** Format raw CJ interceptOrderReasons for admin display — no code guessing. */
export function formatCjInterceptReasonLine(reason: unknown, index: number): string {
  if (reason == null) return `Reason ${index + 1}: (empty)`;
  if (typeof reason === "string") return reason;
  if (typeof reason === "number" || typeof reason === "boolean") {
    return String(reason);
  }
  if (typeof reason === "object") {
    const obj = reason as Record<string, unknown>;
    const code =
      obj.code ?? obj.reasonCode ?? obj.type ?? obj.interceptType ?? null;
    const message =
      obj.message ??
      obj.reason ??
      obj.desc ??
      obj.description ??
      obj.interceptReason ??
      null;
    if (code != null && message != null) {
      return `[${String(code)}] ${String(message)}`;
    }
    if (message != null) return String(message);
    if (code != null) return String(code);
    return JSON.stringify(reason);
  }
  return String(reason);
}

export function formatCjInterceptReasons(reasons: unknown[]): string[] {
  return reasons.map((reason, index) =>
    formatCjInterceptReasonLine(reason, index)
  );
}

export function hasCjInterceptReasons(
  reasons: unknown[] | null | undefined
): reasons is unknown[] {
  return Array.isArray(reasons) && reasons.length > 0;
}
