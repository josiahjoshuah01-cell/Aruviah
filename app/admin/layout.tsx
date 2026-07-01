import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminNavBadges } from "@/lib/admin-queries";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminUser();
  const badges = await getAdminNavBadges();

  return <AdminShell badges={badges}>{children}</AdminShell>;
}
