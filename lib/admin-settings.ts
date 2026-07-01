import { createServiceClient } from "@/lib/supabase/admin";

export type AdminSettings = {
  cj_auto_pay_enabled: boolean;
  cj_auto_pay_daily_cap_usd: number;
  updated_at: string;
};

const DEFAULTS: AdminSettings = {
  cj_auto_pay_enabled: false,
  cj_auto_pay_daily_cap_usd: 100,
  updated_at: new Date().toISOString(),
};

export async function getAdminSettings(): Promise<AdminSettings> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("admin_settings")
    .select("cj_auto_pay_enabled, cj_auto_pay_daily_cap_usd, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return DEFAULTS;

  return {
    cj_auto_pay_enabled: data.cj_auto_pay_enabled,
    cj_auto_pay_daily_cap_usd: Number(data.cj_auto_pay_daily_cap_usd),
    updated_at: data.updated_at,
  };
}

export async function updateAdminSettings(input: {
  cj_auto_pay_enabled: boolean;
  cj_auto_pay_daily_cap_usd: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const cap = Number(input.cj_auto_pay_daily_cap_usd);
  if (!Number.isFinite(cap) || cap < 0) {
    return { ok: false, error: "Daily cap must be a non-negative number." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("admin_settings")
    .update({
      cj_auto_pay_enabled: input.cj_auto_pay_enabled,
      cj_auto_pay_daily_cap_usd: Math.round(cap * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** UTC calendar day — matches cap window for auto-pay. */
export function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

export async function getTodayAutoPaidTotalUsd(): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cj_auto_pay_logs")
    .select("amount_usd")
    .eq("outcome", "success")
    .gte("created_at", startOfUtcDayIso());

  if (error) {
    console.error("[cj-payment] failed to sum today's auto-pay total:", error);
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + Number(row.amount_usd), 0);
}

export function wouldExceedAutoPayCap(
  todayPaidUsd: number,
  orderAmountUsd: number,
  dailyCapUsd: number
): boolean {
  return todayPaidUsd + orderAmountUsd > dailyCapUsd;
}
