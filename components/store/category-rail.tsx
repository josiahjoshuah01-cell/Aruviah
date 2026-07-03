"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

export function CategoryRail({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory =
    pathname.startsWith("/category/")
      ? pathname.split("/category/")[1]
      : searchParams.get("category");

  return (
    <nav
      className="scrollbar-hide flex gap-2 overflow-x-auto px-4 pb-3 md:px-6"
      style={{ scrollSnapType: "x mandatory" }}
      aria-label="Categories"
    >
      <CategoryPill href="/" label="All" isActive={!activeCategory} />
      {categories.map((cat) => (
        <CategoryPill
          key={cat.id}
          href={`/category/${cat.slug}`}
          label={cat.name}
          isActive={activeCategory === cat.slug}
        />
      ))}
    </nav>
  );
}

function CategoryPill({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      suppressHydrationWarning
      className={cn(
        "relative shrink-0 scroll-ml-4 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream",
        isActive
          ? "border-stream bg-stream/10 text-stream"
          : "border-border text-muted-foreground hover:border-stream/50 hover:text-current"
      )}
      style={{ scrollSnapAlign: "start" }}
    >
      {label}
      {isActive && (
        <span className="current-underline current-underline--animate" />
      )}
    </Link>
  );
}
