"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/admin-auth";
import { updateAdminSettings } from "@/lib/admin-settings";

export async function updateCjPaymentSettingsAction(
  cjAutoPayEnabled: boolean,
  cjAutoPayDailyCapUsd: number
) {
  await assertAdminUser();

  const result = await updateAdminSettings({
    cj_auto_pay_enabled: cjAutoPayEnabled,
    cj_auto_pay_daily_cap_usd: cjAutoPayDailyCapUsd,
  });

  if (!result.ok) {
    return result;
  }

  revalidatePath("/admin/settings");
  return { ok: true as const };
}
