"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
  type ActionState,
} from "@/lib/auth/actions";

const initial: ActionState = { ok: false };

function Banner({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-brand-soft text-success" : "bg-red-50 text-danger"}`}
    >
      {state.message}
    </p>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  const params = useSearchParams();
  const urlError = params.get("error");
  const resetDone = params.get("reset") === "1";
  const registered = params.get("registered") === "1";
  const urlMsg =
    urlError === "suspended"
      ? "This account has been suspended."
      : urlError === "verification"
        ? "Email verification failed or the link expired."
        : null;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      {registered && !state.message && (
        <Banner state={{ ok: true, message: "Account created! Check your email to verify your account, then sign in." }} />
      )}
      {resetDone && !state.message && (
        <Banner state={{ ok: true, message: "Password updated. Sign in with your new password." }} />
      )}
      {urlMsg && !state.message && <Banner state={{ ok: false, message: urlMsg }} />}
      <Banner state={state} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email?.[0]} />
      <div className="space-y-1.5">
        <Field label="Password" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password?.[0]} />
        <div className="text-right">
          <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
      </div>
      <Submit pending={pending}>Sign in</Submit>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Banner state={state} />
      <Field label="Full name" name="fullName" autoComplete="name" required error={e.fullName?.[0]} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={e.email?.[0]} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required error={e.password?.[0]} />
      <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required error={e.confirmPassword?.[0]} />
      <Submit pending={pending}>Create account</Submit>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Banner state={state} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email?.[0]} />
      <Submit pending={pending}>Send 6-digit OTP</Submit>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  const params = useSearchParams();
  const defaultEmail = params.get("email") ?? "";
  const sent = params.get("sent") === "1";
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {sent && !state.message && (
        <Banner state={{ ok: true, message: "If an account exists for that email, a 6-digit OTP code has been sent." }} />
      )}
      <Banner state={state} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={defaultEmail}
        required
        error={e.email?.[0]}
      />
      <Field
        label="6-digit OTP code"
        name="token"
        type="text"
        inputMode="numeric"
        maxLength={6}
        placeholder="123456"
        autoComplete="one-time-code"
        required
        error={e.token?.[0]}
      />
      <Field label="New password" name="password" type="password" autoComplete="new-password" required error={e.password?.[0]} />
      <Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required error={e.confirmPassword?.[0]} />
      <Submit pending={pending}>Verify OTP &amp; update password</Submit>
    </form>
  );
}
