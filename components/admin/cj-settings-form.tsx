"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateCjPaymentSettingsAction } from "@/app/admin/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminSettings } from "@/lib/admin-settings";
import type { CjAutoPayLogRow } from "@/lib/admin-queries";
import { formatPrice } from "@/lib/utils";

export function CjSettingsForm({
  settings,
  todayAutoPaidUsd,
  recentLogs,
}: {
  settings: AdminSettings;
  todayAutoPaidUsd: number;
  recentLogs: CjAutoPayLogRow[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.cj_auto_pay_enabled);
  const [cap, setCap] = useState(String(settings.cj_auto_pay_daily_cap_usd));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const capNum = parseFloat(cap);
  const headroom =
    Number.isFinite(capNum) && capNum >= 0
      ? Math.max(0, capNum - todayAutoPaidUsd)
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateCjPaymentSettingsAction(enabled, capNum);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="max-w-lg space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div>
          <h2 className="font-display text-sm font-semibold">CJ wallet payment</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            After createOrderV2, orders are marked unpaid on CJ until you pay
            manually or auto-pay runs (when enabled).
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={pending}
            className="mt-1 h-4 w-4 rounded border-input"
          />
          <span>
            <span className="text-sm font-medium">
              Automatically pay CJ orders
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Off by default. When on, calls payBalanceV2 right after order
              creation if under the daily cap.
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <Label htmlFor="cj-daily-cap">Daily auto-pay limit ($)</Label>
          <Input
            id="cj-daily-cap"
            type="number"
            min="0"
            step="0.01"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Today&apos;s auto-paid total:{" "}
            <strong className="text-current">
              {formatPrice(todayAutoPaidUsd)}
            </strong>
            {headroom != null && (
              <>
                {" "}
                · Headroom:{" "}
                <strong className="text-current">{formatPrice(headroom)}</strong>{" "}
                of {formatPrice(capNum)} cap
              </>
            )}
          </p>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save settings"
          )}
        </Button>

        {error && (
          <p className="text-sm text-coral-pulse" role="alert">
            {error}
          </p>
        )}
        {success && !pending && (
          <p className="text-sm text-stream" role="status">
            Settings saved.
          </p>
        )}
      </form>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display text-sm font-semibold">Auto-pay log</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Recent automatic payBalanceV2 attempts (success, failure, or cap
          blocked).
        </p>
        {recentLogs.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No attempts yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border text-sm">
            {recentLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
                <span className="text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </span>
                <span
                  className={
                    log.outcome === "success"
                      ? "text-stream"
                      : log.outcome === "cap_blocked"
                        ? "text-coral-pulse"
                        : "text-muted-foreground"
                  }
                >
                  {log.outcome}
                </span>
                <span className="tabular-price">{formatPrice(log.amount_usd)}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  order {log.order_id.slice(0, 8)}…
                </span>
                {log.error_message && (
                  <span className="w-full text-xs text-muted-foreground">
                    {log.error_message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
