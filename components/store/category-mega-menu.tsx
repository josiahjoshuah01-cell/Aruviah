"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { groupCategoriesForNav } from "@/lib/category-nav";
import type { Category } from "@/lib/types";

type Props = {
  categories: Category[];
};

export function CategoryMegaMenu({ categories }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory =
    pathname.startsWith("/category/")
      ? pathname.split("/category/")[1]
      : searchParams.get("category");

  const groups = useMemo(
    () => groupCategoriesForNav(categories),
    [categories]
  );

  const hasCategories = categories.length > 0;
  const isCategoryActive = !!activeCategory;

  return (
    <nav
      className="relative px-4 pb-3 md:px-6"
      aria-label="Categories"
    >
      <div className="flex items-center gap-2">
        <NavPill href="/" label="All" isActive={!activeCategory} />

        {hasCategories && (
          <>
            <DesktopMegaMenu
              groups={groups}
              activeCategory={activeCategory}
              isCategoryActive={isCategoryActive}
            />
            <MobileMegaMenu
              groups={groups}
              activeCategory={activeCategory}
              isCategoryActive={isCategoryActive}
            />
          </>
        )}
      </div>
    </nav>
  );
}

function NavPill({
  href,
  label,
  isActive,
  onClick,
  className,
  ...props
}: {
  href?: string;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cn(
    "relative shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream",
    isActive
      ? "border-stream bg-stream/10 text-stream"
      : "border-border text-muted-foreground hover:border-stream/50 hover:text-current",
    className
  );

  const underline = isActive ? (
    <span className="current-underline current-underline--animate" />
  ) : null;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {label}
        {underline}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes} {...props}>
      {label}
      {underline}
    </button>
  );
}

function CategoryLinkList({
  groups,
  activeCategory,
  onNavigate,
  layout,
}: {
  groups: ReturnType<typeof groupCategoriesForNav>;
  activeCategory: string | null;
  onNavigate?: () => void;
  layout: "columns" | "stack";
}) {
  return (
    <div
      className={cn(
        layout === "columns"
          ? "grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "flex flex-col gap-6"
      )}
    >
      {groups.map((group) => (
        <div key={group.section}>
          <h3 className="font-display text-sm font-semibold tracking-tight text-current">
            {group.section}
          </h3>
          <ul className="mt-2 space-y-1">
            {group.categories.map((cat) => {
              const active = activeCategory === cat.slug;
              return (
                <li key={cat.id}>
                  <Link
                    href={`/category/${cat.slug}`}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-md py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream",
                      active
                        ? "font-medium text-stream"
                        : "text-muted-foreground hover:text-stream"
                    )}
                  >
                    {cat.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DesktopMegaMenu({
  groups,
  activeCategory,
  isCategoryActive,
}: {
  groups: ReturnType<typeof groupCategoriesForNav>;
  activeCategory: string | null;
  isCategoryActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  function handleEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function handleLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  return (
    <div
      ref={containerRef}
      className="relative hidden md:block"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream",
          isCategoryActive || open
            ? "border-stream bg-stream/10 text-stream"
            : "border-border text-muted-foreground hover:border-stream/50 hover:text-current"
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
        Categories
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
        {isCategoryActive && (
          <span className="current-underline current-underline--animate" />
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-3rem,56rem)] rounded-xl border border-border bg-mist p-6 shadow-lg"
          role="menu"
        >
          <CategoryLinkList
            groups={groups}
            activeCategory={activeCategory}
            onNavigate={close}
            layout="columns"
          />
        </div>
      )}
    </div>
  );
}

function MobileMegaMenu({
  groups,
  activeCategory,
  isCategoryActive,
}: {
  groups: ReturnType<typeof groupCategoriesForNav>;
  activeCategory: string | null;
  isCategoryActive: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream md:hidden",
            isCategoryActive || open
              ? "border-stream bg-stream/10 text-stream"
              : "border-border text-muted-foreground hover:border-stream/50 hover:text-current"
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          Categories
          {isCategoryActive && (
            <span className="current-underline current-underline--animate" />
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="font-display">Categories</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <CategoryLinkList
            groups={groups}
            activeCategory={activeCategory}
            onNavigate={() => setOpen(false)}
            layout="stack"
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
