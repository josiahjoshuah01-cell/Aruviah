import type { Metadata } from "next";
import { CjSettingsForm } from "@/components/admin/cj-settings-form";
import { getTodayAutoPaidTotalUsd, getAdminSettings } from "@/lib/admin-settings";
import { listRecentAutoPayLogs } from "@/lib/admin-queries";

export const metadata: Metadata = {
  title: "Settings",
};

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [settings, todayAutoPaidUsd, recentLogs] = await Promise.all([
    getAdminSettings(),
    getTodayAutoPaidTotalUsd(),
    listRecentAutoPayLogs(25),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CJ payment automation and daily spending limits.
        </p>
      </header>
      <CjSettingsForm
        settings={settings}
        todayAutoPaidUsd={todayAutoPaidUsd}
        recentLogs={recentLogs}
      />
    </div>
  );
}
