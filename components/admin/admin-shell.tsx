"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  Menu,
  Package,
  ShoppingCart,
  Star,
  Truck,
  Users,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { AdminNavBadges } from "@/lib/admin-queries";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  {
    href: "/admin/fulfillment",
    label: "Fulfillment Queue",
    icon: Truck,
    badgeKey: "fulfillmentCount" as const,
  },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  {
    href: "/admin/staging",
    label: "Staging",
    icon: ClipboardList,
    badgeKey: "stagingPendingCount" as const,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    badgeKey: "cjUnpaidCount" as const,
  },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
];

function NavLinks({
  badges,
  onNavigate,
}: {
  badges: AdminNavBadges;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badge =
          item.badgeKey != null ? badges[item.badgeKey] : 0;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-stream/12 text-stream"
                : "text-muted-foreground hover:bg-accent hover:text-current"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {badge > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-coral-pulse px-1.5 py-0.5 text-[10px] font-bold text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  badges,
  children,
}: {
  badges: AdminNavBadges;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mist">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-mist/95 px-4 backdrop-blur md:hidden">
        <Sheet>
          <SheetTrigger
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
            aria-label="Open admin menu"
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-border px-4 py-4 text-left">
              <SheetTitle className="font-display text-base">
                Aruviah Admin
              </SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <NavLinks badges={badges} />
            </div>
          </SheetContent>
        </Sheet>
        <span className="font-display text-sm font-semibold">Admin</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 border-r border-border md:sticky md:top-0 md:flex md:h-screen md:flex-col">
          <div className="border-b border-border px-4 py-4">
            <Link
              href="/admin"
              className="font-display text-lg font-bold tracking-tight"
            >
              Aruviah
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">Admin panel</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <NavLinks badges={badges} />
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <Link
              href="/"
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-current"
            >
              ← Back to store
            </Link>
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="hidden h-14 items-center justify-end border-b border-border px-6 md:flex">
            <ThemeToggle />
          </header>
          <main className="p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
