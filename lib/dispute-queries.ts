import { createServiceClient } from "@/lib/supabase/admin";
import {
  getDisputeDetail,
  getDisputeList,
  type CjDisputeDetail,
} from "@/lib/cj-disputes";

export type LocalDisputeRow = {
  id: string;
  order_id: string;
  cj_dispute_id: string | null;
  cj_order_id: string;
  status: string;
  reason: string | null;
  expect_type: number | null;
  refund_amount: number | null;
  created_at: string;
  updated_at: string;
};

function isOpenDisputeStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "processing" || s === "pending";
}

/** Customer-safe: verifies order ownership before checking disputes (service role). */
export async function customerHasOpenDisputeForOrder(
  orderId: string,
  userId: string
): Promise<boolean> {
  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!order) return false;

  const { data: disputes, error } = await supabase
    .from("disputes")
    .select("status")
    .eq("order_id", orderId);

  if (error) return false;

  return (disputes ?? []).some((d) => isOpenDisputeStatus(d.status));
}

export async function listDisputesForOrder(
  orderId: string
): Promise<LocalDisputeRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("disputes")
    .select(
      "id, order_id, cj_dispute_id, cj_order_id, status, reason, expect_type, refund_amount, created_at, updated_at"
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    refund_amount:
      row.refund_amount != null ? Number(row.refund_amount) : null,
  }));
}

export async function insertDisputeRow(input: {
  orderId: string;
  cjOrderId: string;
  cjDisputeId?: string | null;
  status: string;
  reason?: string | null;
  expectType?: 1 | 2;
  refundAmount?: number | null;
}): Promise<LocalDisputeRow> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("disputes")
    .insert({
      order_id: input.orderId,
      cj_order_id: input.cjOrderId,
      cj_dispute_id: input.cjDisputeId ?? null,
      status: input.status,
      reason: input.reason ?? null,
      expect_type: input.expectType ?? null,
      refund_amount: input.refundAmount ?? null,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, order_id, cj_dispute_id, cj_order_id, status, reason, expect_type, refund_amount, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save dispute");
  }

  return {
    ...data,
    refund_amount:
      data.refund_amount != null ? Number(data.refund_amount) : null,
  };
}

export async function updateDisputeFromCjDetail(
  localId: string,
  detail: CjDisputeDetail
): Promise<void> {
  const supabase = createServiceClient();
  const refund =
    detail.refundAmount ?? detail.money ?? null;

  const { error } = await supabase
    .from("disputes")
    .update({
      cj_dispute_id: detail.id,
      status: detail.status,
      reason: detail.disputeReason,
      refund_amount: refund,
      updated_at: new Date().toISOString(),
    })
    .eq("id", localId);

  if (error) throw error;
}

export async function syncDisputeFromCj(
  localId: string,
  cjDisputeId: string
): Promise<{ ok: true; detail: CjDisputeDetail } | { ok: false; error: string }> {
  const detailResult = await getDisputeDetail(cjDisputeId);
  if (!detailResult.ok) {
    return { ok: false, error: detailResult.error };
  }

  await updateDisputeFromCjDetail(localId, detailResult.data);
  return { ok: true, detail: detailResult.data };
}

export async function resolveNewestCjDisputeId(
  cjOrderId: string
): Promise<string | null> {
  const listResult = await getDisputeList({
    cjOrderId,
    pageNum: 1,
    pageSize: 20,
  });
  if (!listResult.ok || !listResult.data.list.length) {
    return null;
  }

  const sorted = [...listResult.data.list]
    .filter((d) => d.id?.trim())
    .sort((a, b) => {
      const da = a.createDate ? Date.parse(a.createDate) : 0;
      const db = b.createDate ? Date.parse(b.createDate) : 0;
      return db - da;
    });

  return sorted[0]?.id ?? null;
}

export async function syncAllDisputesFromCjForOrder(
  orderId: string,
  cjOrderId: string
): Promise<{ ok: true; synced: number } | { ok: false; error: string }> {
  const listResult = await getDisputeList({
    cjOrderId,
    pageNum: 1,
    pageSize: 50,
  });
  if (!listResult.ok) {
    return { ok: false, error: listResult.error };
  }

  const supabase = createServiceClient();
  const local = await listDisputesForOrder(orderId);
  let synced = 0;

  for (const item of listResult.data.list) {
    if (!item.id?.trim()) continue;
    const existing = local.find((d) => d.cj_dispute_id === item.id);
    if (existing) {
      const { error } = await supabase
        .from("disputes")
        .update({
          status: item.status,
          reason: item.disputeReason,
          refund_amount: item.money ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (!error) synced += 1;
    } else {
      const { error } = await supabase.from("disputes").insert({
        order_id: orderId,
        cj_order_id: cjOrderId,
        cj_dispute_id: item.id,
        status: item.status,
        reason: item.disputeReason,
        refund_amount: item.money ?? null,
        updated_at: new Date().toISOString(),
      });
      if (!error) synced += 1;
    }
  }

  return { ok: true, synced };
}
