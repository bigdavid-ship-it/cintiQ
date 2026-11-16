"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConfigured } from "@/lib/env";
import { isEmailConfigured, renderCintiqEmailHtml, sendTransactionalEmail } from "@/lib/notifications/email";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  verifyResetOtpSchema,
} from "@/lib/validation/auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { homeForRoles, safeRedirect, type AppRole } from "@/lib/auth/roles";

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[]>; otpVerified?: boolean };

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
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const rl = rateLimit(`register:${await clientIp()}`, 5, 15 * 60_000);
  if (!rl.ok) return { ok: false, message: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };

  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const rawOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    h.get("origin") ||
    (forwardedHost ? `https://${forwardedHost}` : "");
  const origin = rawOrigin.replace(/\/+$/, "");

  if (isEmailConfigured() && isConfigured("SUPABASE_SERVICE_ROLE_KEY")) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        ...(origin ? { redirectTo: `${origin}/auth/callback` } : {}),
      },
    });
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (error.code === "email_exists" || msg.includes("already") || msg.includes("exists")) {
        return {
          ok: false,
          message: "An account with this email already exists. Please sign in or reset your password.",
        };
      }
      return { ok: false, message: error.message || "We could not create your account. Check your details and try again." };
    }

    const hashedToken = data?.properties?.hashed_token;
    const actionLink =
      origin && hashedToken
        ? `${origin}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=signup`
        : data?.properties?.action_link;
    if (!actionLink) {
      return { ok: false, message: "Could not generate your confirmation link. Please try again." };
    }

    const mail = await sendTransactionalEmail({
      to: parsed.data.email,
      subject: "Welcome to cintiQ — Confirm your account",
      html: renderCintiqEmailHtml({
        title: "Welcome to cintiQ! Confirm your account",
        body: [
          "Thanks for joining cintiQ — your campus marketplace for verified student entrepreneurs and local businesses.",
          "",
          "Here's how to get started as a buyer:",
          "1. Browse products or verified storefronts across campus.",
          "2. Pay safely with Paystack for hostel delivery or collection.",
          "3. Inspect your order and share your 6-digit OTP at handover.",
          "",
          "Tap the button below to verify your email address and activate your account.",
        ].join("\n"),
        recipientName: parsed.data.fullName,
        recipientEmail: parsed.data.email,
        ctaLabel: "Confirm my account",
        ctaUrl: actionLink,
      }),
    });
    if (!mail.ok) {
      return { ok: false, message: `Account created, but we could not send the confirmation email (${mail.reason}).` };
    }
    redirect("/login?registered=1");
  }

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

  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return {
      ok: false,
      message: "An account with this email already exists. Please sign in or reset your password.",
    };
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

  if (isEmailConfigured() && isConfigured("SUPABASE_SERVICE_ROLE_KEY")) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: parsed.data.email,
    });
    if (!error && data?.properties?.email_otp) {
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name")
        .eq("email", parsed.data.email)
        .maybeSingle();
      await sendTransactionalEmail({
        to: parsed.data.email,
        subject: "Your cintiQ password reset code",
        html: renderCintiqEmailHtml({
          title: "Your cintiQ password reset code",
          body: `Use this 6-digit OTP code to verify your identity and reset your password:\n\n${data.properties.email_otp}\n\nIf you did not request a password reset, you can safely ignore this email.`,
          recipientName: prof?.full_name,
          recipientEmail: parsed.data.email,
        }),
      }).catch(() => {});
    }
  } else {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email);
  }

  redirect(`/reset-password?email=${encodeURIComponent(parsed.data.email)}&sent=1`);
}

export async function verifyResetOtpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!configured()) return { ok: false, message: "Authentication service is not configured." };

  const parsed = verifyResetOtpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const rl = rateLimit(`verify-otp:${await clientIp()}:${parsed.data.email}`, 8, 15 * 60_000);
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

  return {
    ok: true,
    otpVerified: true,
    message: "OTP verified! Now enter and confirm your new password below.",
  };
}

export async function updatePasswordAfterOtpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!configured()) return { ok: false, message: "Authentication service is not configured." };

  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, otpVerified: true, fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, otpVerified: true, message: error.message || "Could not update password. Request a new OTP code." };
  }

  await supabase.auth.signOut();
  redirect("/login?reset=1");
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
