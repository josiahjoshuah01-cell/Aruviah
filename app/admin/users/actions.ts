"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser, getAdminKindForUser } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin";

export async function grantAdmin(
  targetUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await assertAdminUser();

  const supabase = createServiceClient();
  const { error } = await supabase.from("admin_users").upsert(
    {
      user_id: targetUserId,
      granted_by: currentUser.id,
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function revokeAdmin(
  targetUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await assertAdminUser();

  const { data: targetUser } = await createServiceClient()
    .auth.admin.getUserById(targetUserId);
  const targetEmail = targetUser?.user?.email ?? null;

  const targetKind = await getAdminKindForUser(targetUserId, targetEmail);
  if (targetKind === "founder") {
    return { ok: false, error: "The founder account cannot be revoked." };
  }

  if (targetUserId === currentUser.id) {
    return { ok: false, error: "You cannot remove your own admin access." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("admin_users")
    .delete()
    .eq("user_id", targetUserId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
