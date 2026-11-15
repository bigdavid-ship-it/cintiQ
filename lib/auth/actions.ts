"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { homeForRoles, safeRedirect, type AppRole } from "@/lib/auth/roles";

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[]> };

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function configured() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export async function registerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!configured()) return { ok: false, message: "Authentication service is not configured." };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const rl = rateLimit(`register:${await clientIp()}`, 5, 15 * 60_000);
  if (!rl.ok) return { ok: false, message: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };

  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const rawOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    h.get("origin") ||
    (forwardedHost ? `https://${forwardedHost}` : "");
  const origin = rawOrigin.replace(/\/+$/, "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      ...(origin ? { emailRedirectTo: `${origin}/auth/callback` } : {}),
    },
  });
  if (error) {
    console.error("signUp error:", error.code, error.message);
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { ok: false, message: "Too many verification emails sent right now. Please wait a few minutes (or connect Custom SMTP in Supabase)." };
    }
    if (error.code === "weak_password") {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: error.message || "We could not create your account. Check your details and try again." };
  }

  if (data.session) {
    redirect("/");
  }
  redirect("/login?registered=1");
}

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!configured()) return { ok: false, message: "Authentication service is not configured." };

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const rl = rateLimit(`login:${await clientIp()}:${parsed.data.email}`, 8, 15 * 60_000);
  if (!rl.ok) return { ok: false, message: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return { ok: false, message: "Verify your email before signing in." };
    return { ok: false, message: "Invalid email or password." };
  }

  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", data.user.id),
    supabase.from("profiles").select("is_suspended").eq("id", data.user.id).maybeSingle(),
  ]);
  if (profile?.is_suspended) {
    await supabase.auth.signOut();
    return { ok: false, message: "This account has been suspended. Contact cintiQ support." };
  }

  const home = homeForRoles((roles ?? []).map((r) => r.role as AppRole));
  redirect(safeRedirect(formData.get("next")?.toString(), home));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!configured()) return { ok: false, message: "Authentication service is not configured." };

  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const rl = rateLimit(`forgot:${await clientIp()}:${parsed.data.email}`, 5, 15 * 60_000);
  if (!rl.ok) return { ok: false, message: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email);

  redirect(`/reset-password?email=${encodeURIComponent(parsed.data.email)}&sent=1`);
}

export async function resetPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!configured()) return { ok: false, message: "Authentication service is not configured." };

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const rl = rateLimit(`reset:${await clientIp()}:${parsed.data.email}`, 8, 15 * 60_000);
  if (!rl.ok) return { ok: false, message: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };

  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "recovery",
  });
  if (otpError) {
    return { ok: false, message: "Invalid or expired OTP code. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, message: error.message || "Could not update password. Try again." };
  }

  await supabase.auth.signOut();
  redirect("/login?reset=1");
}
