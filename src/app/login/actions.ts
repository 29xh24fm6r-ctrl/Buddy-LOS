"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  if (!readFoundationStatus().authEnabled) redirect("/login?error=not-enabled");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !email.includes("@") || password.length < 8) redirect("/login?error=invalid-input");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=invalid-credentials");

  revalidatePath("/", "layout");
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/");
}
