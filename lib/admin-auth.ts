import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

function isFounderEmail(email: string | undefined | null): boolean {
  const founderEmail = process.env.ADMIN_EMAIL?.trim();
  return !!(founderEmail && email && email === founderEmail);
}

async function isDbAdmin(userId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  if (isFounderEmail(user.email)) return true;
  return isDbAdmin(user.id);
}

export type AdminKind = "founder" | "granted" | null;

export async function getAdminKindForUser(
  userId: string,
  email: string | null
): Promise<AdminKind> {
  if (isFounderEmail(email)) return "founder";
  if (await isDbAdmin(userId)) return "granted";
  return null;
}

export async function getSessionInfo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;

  let isAdmin = false;
  if (user) {
    isAdmin = isFounderEmail(email) || (await isDbAdmin(user.id));
  }

  return {
    email,
    isLoggedIn: !!user,
    isAdmin,
  };
}

export async function requireAdminUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const admin = isFounderEmail(user.email) || (await isDbAdmin(user.id));
  if (!admin) redirect("/");

  return user;
}

export async function assertAdminUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const admin = isFounderEmail(user.email) || (await isDbAdmin(user.id));
  if (!admin) throw new Error("Unauthorized");

  return user;
}
