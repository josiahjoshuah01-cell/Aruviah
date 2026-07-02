import { formatVariantLabel } from "@/lib/variant-utils";
import { isMixedVerification } from "@/lib/cj-verified-warehouse";
import type { StagedVariantJson } from "@/lib/staging-types";

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center rounded-md border border-stream/25 bg-stream/8 px-2.5 py-1 text-xs font-medium text-stream">
        Verified inventory
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
      Unverified inventory
    </span>
  );
}

export function StagingVerifiedWarehouseBadges({
  productVerified,
  variants,
}: {
  productVerified: boolean | null;
  variants: StagedVariantJson[];
}) {
  const flags = variants.map((v) => v.is_verified_warehouse ?? null);
  const mixed = isMixedVerification(flags);

  if (flags.every((f) => f === null)) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {mixed ? (
          <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Mixed inventory verification
          </span>
        ) : productVerified === true ? (
          <VerifiedBadge verified />
        ) : productVerified === false ? (
          <VerifiedBadge verified={false} />
        ) : null}
      </div>
      {mixed && variants.length > 1 && (
        <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {variants.map((v) => {
            const label = formatVariantLabel(v.color, v.size) ?? v.cj_variant_id;
            const flag = v.is_verified_warehouse;
            if (flag === null) return null;
            return (
              <li
                key={v.cj_variant_id}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/30 px-2 py-0.5"
              >
                <span>{label}</span>
                <span
                  className={
                    flag
                      ? "text-stream"
                      : "text-amber-800 dark:text-amber-200"
                  }
                >
                  {flag ? "verified" : "unverified"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function StagingCjReviewSignal({
  count,
  avgScore,
}: {
  count: number | null;
  avgScore: number | null;
}) {
  if (count == null || count <= 0) return null;

  const stars =
    avgScore != null ? `${avgScore.toFixed(1)}★` : "no score on file";

  return (
    <p className="rounded-md border border-dashed border-muted-foreground/35 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      CJ listing: {stars} ({count.toLocaleString()} review
      {count === 1 ? "" : "s"}) — supplier data, not shown to customers
    </p>
  );
}
