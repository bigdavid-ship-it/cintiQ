import { Suspense } from "react";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Verify OTP & set new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Enter OTP &amp; new password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Enter the 6-digit code sent to your email and choose a new password.
      </p>
      <Suspense><ResetPasswordForm /></Suspense>
      <p className="mt-6 text-sm text-muted-foreground">
        Didn&apos;t get a code? <Link href="/forgot-password" className="font-medium text-brand underline">Send again</Link>
      </p>
    </>
  );
}
