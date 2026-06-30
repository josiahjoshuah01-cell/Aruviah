import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StoreNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="font-display text-xl font-semibold">Page not found</h2>
      <p className="max-w-md text-muted-foreground">
        This product or category doesn&apos;t exist in our catalog. It may have
        flowed past.
      </p>
      <Button asChild>
        <Link href="/">Back to shop</Link>
      </Button>
    </div>
  );
}
