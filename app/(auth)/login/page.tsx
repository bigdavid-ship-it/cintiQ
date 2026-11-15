import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Welcome back to cintiQ.</p>
      <Suspense><LoginForm /></Suspense>
      <p className="mt-6 text-sm text-muted-foreground">
        New here? <Link href="/register" className="font-medium text-brand underline">Create an account</Link>
      </p>
    </>
  );
}
