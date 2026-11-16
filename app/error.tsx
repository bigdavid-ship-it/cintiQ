"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-xs">
        <h1 className="font-display text-xl font-semibold">We couldn&apos;t load this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A temporary connection or server hiccup occurred. Tap below to retry right away.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button type="button" onClick={() => reset()}>
            <RefreshCw className="size-4" aria-hidden /> Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
        <div className="mt-4">
          <Link href="/" className="text-xs font-medium text-brand hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
