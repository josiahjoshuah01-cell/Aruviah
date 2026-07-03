"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, ShoppingBag } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchBar } from "@/components/store/search-bar";
import { CartDrawer } from "@/components/store/cart-drawer";
import { createClient } from "@/lib/supabase/client";
import { useCartStore, selectCartTotalItems } from "@/lib/cart-store";
import { Suspense, useEffect, useState } from "react";

type HeaderProps = {
  isAdmin?: boolean;
  isLoggedIn?: boolean;
};

export function Header({ isAdmin = false, isLoggedIn = false }: HeaderProps) {
  const router = useRouter();
  const totalItems = useCartStore(selectCartTotalItems);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const displayCount = mounted ? totalItems : 0;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-mist/95 backdrop-blur supports-[backdrop-filter]:bg-mist/80">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-6 md:px-6">
        <Link
          href="/"
          suppressHydrationWarning
          className="font-display text-xl font-bold tracking-tight text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
        >
          Aruviah
        </Link>

        <Suspense fallback={<div className="flex-1 max-w-xl h-10 rounded-md bg-muted animate-pulse" />}>
          <SearchBar />
        </Suspense>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <CartDrawer>
            <button
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
              aria-label={`Cart, ${displayCount} items`}
            >
              <ShoppingBag className="h-5 w-5" />
              {displayCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-stream px-1 text-[10px] font-bold text-white">
                  {displayCount > 99 ? "99+" : displayCount}
                </span>
              )}
            </button>
          </CartDrawer>
          <Link
            href="/account/orders"
            suppressHydrationWarning
            className="hidden text-sm text-muted-foreground hover:text-current sm:inline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream rounded px-2 py-1"
          >
            Orders
          </Link>
          {isAdmin && (
            <Link
              href="/admin/staging"
              suppressHydrationWarning
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-stream hover:text-stream/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
              title="Admin staging"
            >
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Staging</span>
            </Link>
          )}
          {isLoggedIn ? (
            <button
              type="button"
              onClick={signOut}
              className="hidden text-sm text-muted-foreground hover:text-current sm:inline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream rounded px-2 py-1"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/login"
              suppressHydrationWarning
              className="hidden text-sm text-muted-foreground hover:text-current sm:inline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream rounded px-2 py-1"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
