import Link from "next/link";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Shop from verified campus sellers.</p>
      <RegisterForm />
      <p className="mt-6 text-sm text-muted-foreground">
        Already registered? <Link href="/login" className="font-medium text-brand underline">Sign in</Link>
      </p>
    </>
  );
}
