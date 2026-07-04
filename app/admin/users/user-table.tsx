"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldAlert, Crown } from "lucide-react";
import { grantAdmin, revokeAdmin } from "./actions";
import type { AdminUserRow } from "@/lib/admin-queries";

type Props = {
  users: AdminUserRow[];
  currentAdminId: string;
};

export function UserTable({ users, currentAdminId }: Props) {
  const [filter, setFilter] = useState("");

  const filtered = filter.trim()
    ? users.filter((u) =>
        (u.email ?? "").toLowerCase().includes(filter.trim().toLowerCase())
      )
    : users;

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by email…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full max-w-sm rounded-md border border-border bg-mist px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream"
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/40">
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium">Joined</th>
              <th className="px-4 py-2.5 text-left font-medium">Role</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                currentAdminId={currentAdminId}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {users.length} total user{users.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function UserRow({
  user,
  currentAdminId,
}: {
  user: AdminUserRow;
  currentAdminId: string;
}) {
  const [confirmAction, setConfirmAction] = useState<
    "grant" | "revoke" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSelf = user.id === currentAdminId;
  const isFounder = user.adminKind === "founder";
  const isAdmin = user.adminKind !== null;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result =
        confirmAction === "grant"
          ? await grantAdmin(user.id)
          : await revokeAdmin(user.id);

      if (!result.ok) {
        setError(result.error);
      }
      setConfirmAction(null);
    });
  }

  const revokeDisabled = isFounder || isSelf;
  let revokeTooltip = "Remove admin access";
  if (isFounder) revokeTooltip = "Founder admin cannot be revoked";
  if (isSelf) revokeTooltip = "You cannot remove your own admin access";

  return (
    <>
      <tr className="hover:bg-accent/20 transition-colors">
        <td className="px-4 py-2.5 font-mono text-xs">
          {user.email ?? "—"}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">
          {new Date(user.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-2.5">
          <RoleBadge kind={user.adminKind} />
        </td>
        <td className="px-4 py-2.5 text-right">
          {!isAdmin ? (
            <button
              type="button"
              onClick={() => setConfirmAction("grant")}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-md border border-stream/30 bg-stream/5 px-2.5 py-1 text-xs font-medium text-stream hover:bg-stream/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stream disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Make admin
            </button>
          ) : (
            <button
              type="button"
              onClick={() => !revokeDisabled && setConfirmAction("revoke")}
              disabled={isPending || revokeDisabled}
              title={revokeTooltip}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Remove admin
            </button>
          )}
        </td>
      </tr>

      {confirmAction && (
        <tr>
          <td colSpan={4} className="px-4 py-3 bg-accent/30">
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm">
                {confirmAction === "grant" ? (
                  <>
                    Grant admin access to{" "}
                    <strong>{user.email ?? user.id}</strong>? They will be
                    able to access all admin functionality.
                  </>
                ) : (
                  <>
                    Revoke admin access from{" "}
                    <strong>{user.email ?? user.id}</strong>? They will
                    immediately lose access to the admin panel.
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirmAction(null);
                  setError(null);
                }}
                disabled={isPending}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
                  confirmAction === "grant"
                    ? "bg-stream hover:bg-stream/90"
                    : "bg-destructive hover:bg-destructive/90"
                }`}
              >
                {isPending
                  ? "Processing…"
                  : confirmAction === "grant"
                    ? "Yes, grant admin"
                    : "Yes, revoke admin"}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function RoleBadge({ kind }: { kind: "founder" | "granted" | null }) {
  if (kind === "founder") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <Crown className="h-3 w-3" />
        Founder
      </span>
    );
  }
  if (kind === "granted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-stream/10 px-2 py-0.5 text-xs font-semibold text-stream">
        <ShieldCheck className="h-3 w-3" />
        Admin
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">Customer</span>
  );
}
