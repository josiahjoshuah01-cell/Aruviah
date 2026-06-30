"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="font-display text-xl font-semibold">
        Couldn&apos;t load this page
      </h2>
      <p className="max-w-md text-muted-foreground">
        Something went wrong while loading the catalog. The current may have
        stalled — try again.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to shop</Link>
        </Button>
      </div>
    </div>
  );
}
