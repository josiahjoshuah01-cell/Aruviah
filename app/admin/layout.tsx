import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminUser();

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-border bg-mist/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream rounded px-1"
          >
            ← Back to store
          </Link>
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-stream">
            <ClipboardList className="h-4 w-4" />
            Admin staging
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
