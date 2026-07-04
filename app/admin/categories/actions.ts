"use server";

import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin";

export async function updateCategorySection(
  categoryId: string,
  section: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdminUser();

  const trimmed = section?.trim() ?? "";
  const value = trimmed.length > 0 ? trimmed : null;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("categories")
    .update({ section: value })
    .eq("id", categoryId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/categories");
  revalidatePath("/", "layout");
  return { ok: true };
}
