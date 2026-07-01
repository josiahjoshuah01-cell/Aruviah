import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getSessionInfo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const email = user?.email ?? null;

  return {
    email,
    isLoggedIn: !!user,
    isAdmin: !!(adminEmail && email && email === adminEmail),
  };
}

export async function requireAdminUser() {  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail || user?.email !== adminEmail) {
    redirect("/");
  }

  return user;
}

export async function assertAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail || user?.email !== adminEmail) {
    throw new Error("Unauthorized");
  }

  return user;
}
