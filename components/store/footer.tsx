import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-mist">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tight text-current"
          >
            Aruviah
          </Link>

          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link
              href="/legal/terms"
              className="hover:text-current transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/legal/privacy"
              className="hover:text-current transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/legal/shipping-returns"
              className="hover:text-current transition-colors"
            >
              Shipping &amp; Returns
            </Link>
          </nav>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Aruviah. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
