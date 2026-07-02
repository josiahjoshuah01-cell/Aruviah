"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DisputeStatusBadge } from "@/components/admin/dispute-status-badge";
import {
  createDisputeAction,
  fetchDisputeConfirmInfoAction,
  fetchDisputeEligibleProductsAction,
  refreshDisputeDetailAction,
  refreshDisputesFromCjAction,
} from "@/app/admin/orders/actions";
import type {
  CjDisputeConfirmInfo,
  CjDisputeProduct,
} from "@/lib/cj-disputes";
import type { LocalDisputeRow } from "@/lib/dispute-queries";
import { formatPrice } from "@/lib/utils";

type WizardStep = "items" | "reason" | "submit" | "done";

export function OrderDisputePanel({
  orderId,
  cjOrderId,
  disputes: initialDisputes,
}: {
  orderId: string;
  cjOrderId: string;
  disputes: LocalDisputeRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("items");
  const [products, setProducts] = useState<CjDisputeProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmInfo, setConfirmInfo] = useState<CjDisputeConfirmInfo | null>(
    null
  );
  const [reasonId, setReasonId] = useState<number | "">("");
  const [expectType, setExpectType] = useState<1 | 2>(1);
  const [messageText, setMessageText] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const activeDispute = initialDisputes.find((d) => {
    const s = d.status.toLowerCase();
    return s === "processing" || s === "pending";
  });

  function resetWizard() {
    setStep("items");
    setProducts([]);
    setSelectedIds(new Set());
    setConfirmInfo(null);
    setReasonId("");
    setExpectType(1);
    setMessageText("");
    setImageUrl("");
  }

  function openWizard() {
    resetWizard();
    setWizardOpen(true);
    startTransition(async () => {
      const result = await fetchDisputeEligibleProductsAction(orderId);
      if (!result.ok) {
        toast.error(result.error);
        setWizardOpen(false);
        return;
      }
      setProducts(result.data.productInfoList);
    });
  }

  function toggleItem(lineItemId: string, canChoose: boolean) {
    if (!canChoose) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineItemId)) next.delete(lineItemId);
      else next.add(lineItemId);
      return next;
    });
  }

  function goToReasonStep() {
    if (!selectedIds.size) {
      toast.error("Select at least one eligible item");
      return;
    }
    startTransition(async () => {
      const result = await fetchDisputeConfirmInfoAction(
        orderId,
        [...selectedIds]
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirmInfo(result.data);
      const options = result.data.expectResultOptionList;
      if (options.includes("1")) setExpectType(1);
      else if (options.includes("2")) setExpectType(2);
      if (result.data.disputeReasonList.length === 1) {
        setReasonId(result.data.disputeReasonList[0]!.disputeReasonId);
      }
      setStep("reason");
    });
  }

  function goToSubmitStep() {
    if (reasonId === "") {
      toast.error("Select a dispute reason from CJ's list");
      return;
    }
    setStep("submit");
  }

  function submitDispute() {
    if (!messageText.trim()) {
      toast.error("Message is required by CJ");
      return;
    }
    if (reasonId === "") return;

    startTransition(async () => {
      const result = await createDisputeAction({
        orderId,
        selectedLineItemIds: [...selectedIds],
        disputeReasonId: reasonId,
        expectType,
        messageText: messageText.trim(),
        imageUrls: imageUrl.trim() ? [imageUrl.trim()] : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.cjDisputeId
          ? `Dispute filed (${result.cjDisputeId})`
          : "Dispute filed — refresh from CJ to load dispute id"
      );
      setStep("done");
      router.refresh();
    });
  }

  function refreshAll() {
    startTransition(async () => {
      const result = await refreshDisputesFromCjAction(orderId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Synced ${result.synced} dispute(s) from CJ`);
      router.refresh();
    });
  }

  function refreshOne(dispute: LocalDisputeRow) {
    if (!dispute.cj_dispute_id) {
      toast.error("No CJ dispute id yet — use Refresh from CJ on the list");
      return;
    }
    startTransition(async () => {
      const result = await refreshDisputeDetailAction(
        orderId,
        dispute.id,
        dispute.cj_dispute_id!
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Dispute updated from CJ");
      router.refresh();
    });
  }

  const canRefund = confirmInfo?.expectResultOptionList.includes("1");
  const canReissue = confirmInfo?.expectResultOptionList.includes("2");

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            CJ disputes
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            CJ order {cjOrderId} · API-created orders only
          </p>
        </div>
        {activeDispute && (
          <DisputeStatusBadge status={activeDispute.status} />
        )}
      </div>

      {initialDisputes.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Dispute history</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={refreshAll}
            >
              {pending ? "Refreshing…" : "Refresh from CJ"}
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {initialDisputes.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{d.reason ?? "—"}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {d.cj_dispute_id ?? "Pending CJ id"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Filed {new Date(d.created_at).toLocaleString()}
                    {d.expect_type === 2
                      ? " · Reissue"
                      : d.expect_type === 1
                        ? " · Refund"
                        : ""}
                    {d.refund_amount != null
                      ? ` · max ${formatPrice(d.refund_amount)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <DisputeStatusBadge status={d.status} />
                  {d.cj_dispute_id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={pending}
                      onClick={() => refreshOne(d)}
                    >
                      Refresh
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!wizardOpen ? (
        <Button
          type="button"
          className="mt-4"
          variant="outline"
          onClick={openWizard}
          disabled={pending}
        >
          Report an issue with this order
        </Button>
      ) : (
        <div className="mt-4 space-y-4 rounded-md border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {step === "items" && "Step A — Which items?"}
              {step === "reason" && "Step B — Reason & refund limits"}
              {step === "submit" && "Step C — Details & submit"}
              {step === "done" && "Dispute submitted"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setWizardOpen(false);
                resetWizard();
              }}
            >
              Close
            </Button>
          </div>

          {step === "items" && (
            <>
              {pending && !products.length ? (
                <p className="text-sm text-muted-foreground">
                  Loading eligible products from CJ…
                </p>
              ) : products.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No line items returned for this order.
                </p>
              ) : (
                <ul className="space-y-2">
                  {products.map((p) => (
                    <li
                      key={p.lineItemId}
                      className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={selectedIds.has(p.lineItemId)}
                        disabled={!p.canChoose || pending}
                        title={
                          p.canChoose
                            ? undefined
                            : "Not eligible — may already be disputed, outside the dispute window, or not yet delivered"
                        }
                        onChange={() =>
                          toggleItem(p.lineItemId, p.canChoose)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {p.cjProductName ?? p.sku ?? "Product"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SKU {p.sku ?? "—"} · qty {p.quantity} ·{" "}
                          {formatPrice(p.price)}
                        </p>
                        {!p.canChoose && (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            Not eligible for dispute (already disputed, outside
                            window, or order status does not allow disputes).
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                disabled={pending || !selectedIds.size}
                onClick={goToReasonStep}
              >
                {pending ? "Loading…" : "Continue"}
              </Button>
            </>
          )}

          {step === "reason" && confirmInfo && (
            <>
              <dl className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Max product</dt>
                  <dd className="tabular-price font-medium">
                    {formatPrice(confirmInfo.maxProductPrice)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Max postage</dt>
                  <dd className="tabular-price font-medium">
                    {formatPrice(confirmInfo.maxPostage)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Max refund</dt>
                  <dd className="tabular-price font-semibold">
                    {formatPrice(confirmInfo.maxAmount)}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1">
                <Label htmlFor="dispute-reason">Dispute reason (from CJ)</Label>
                <select
                  id="dispute-reason"
                  value={reasonId}
                  onChange={(e) =>
                    setReasonId(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select a reason…</option>
                  {confirmInfo.disputeReasonList.map((r) => (
                    <option
                      key={r.disputeReasonId}
                      value={r.disputeReasonId}
                    >
                      {r.reasonName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStep("items")}>
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={pending || reasonId === ""}
                  onClick={goToSubmitStep}
                >
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === "submit" && confirmInfo && (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Expected outcome</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="expectType"
                    checked={expectType === 1}
                    disabled={!canRefund}
                    onChange={() => setExpectType(1)}
                  />
                  Refund
                  {!canRefund && (
                    <span className="text-xs text-muted-foreground">
                      (not offered by CJ for this order)
                    </span>
                  )}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="expectType"
                    checked={expectType === 2}
                    disabled={!canReissue}
                    onChange={() => setExpectType(2)}
                  />
                  Reissue
                  {!canReissue && (
                    <span className="text-xs text-muted-foreground">
                      (not offered by CJ for this order)
                    </span>
                  )}
                </label>
              </fieldset>

              <div className="space-y-1">
                <Label htmlFor="dispute-message">Message (required)</Label>
                <textarea
                  id="dispute-message"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  maxLength={500}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Describe the issue for CJ…"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dispute-image">
                  Evidence image URL (optional)
                </Label>
                <Input
                  id="dispute-image"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStep("reason")}>
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={pending || !messageText.trim()}
                  onClick={submitDispute}
                >
                  {pending ? "Submitting…" : "Submit dispute to CJ"}
                </Button>
              </div>
            </>
          )}

          {step === "done" && (
            <p className="text-sm text-muted-foreground">
              Your dispute was submitted. Status appears in dispute history
              above; use Refresh from CJ to pull the latest CJ dispute id and
              status.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
