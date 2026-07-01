import type { Metadata } from "next";

export const metadata: Metadata = { title: "Categories" };

export default function AdminCategoriesPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <h1 className="font-display text-xl font-bold">Categories</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Category management — coming in the next admin phase.
      </p>
    </div>
  );
}
