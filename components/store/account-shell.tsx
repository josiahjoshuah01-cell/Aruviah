import Link from "next/link";

export function AccountShell({
  children,
  backHref,
  backLabel = "← Back to orders",
}: {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-border px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="font-display text-xl font-bold">
            Aruviah
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-current"
          >
            Store
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        {backHref && (
          <Link
            href={backHref}
            className="mb-4 inline-block text-sm text-muted-foreground hover:text-current"
          >
            {backLabel}
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
