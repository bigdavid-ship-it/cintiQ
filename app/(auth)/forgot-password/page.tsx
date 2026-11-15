import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Enter the email linked to your cintiQ account and we&apos;ll send a 6-digit OTP code.
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm text-muted-foreground">
        Remembered it? <Link href="/login" className="font-medium text-brand underline">Back to sign in</Link>
      </p>
    </>
  );
}
