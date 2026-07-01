import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <h1 className="font-display text-xl font-bold">Users</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Customer visibility — coming in the next admin phase.
      </p>
    </div>
  );
}
