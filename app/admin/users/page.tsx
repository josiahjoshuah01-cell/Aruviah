import type { Metadata } from "next";
import { listAllUsers } from "@/lib/admin-queries";
import { requireAdminUser } from "@/lib/admin-auth";
import { UserTable } from "./user-table";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const currentAdmin = await requireAdminUser();
  const users = await listAllUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage user accounts and admin access.
        </p>
      </div>
      <UserTable users={users} currentAdminId={currentAdmin.id} />
    </div>
  );
}
