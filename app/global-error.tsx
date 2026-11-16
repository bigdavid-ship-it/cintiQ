"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global app error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#fafaf7] px-4 text-[#12161c]">
        <div className="w-full max-w-md rounded-2xl border border-[#e2e0d8] bg-white p-6 text-center shadow-xs">
          <h1 className="text-xl font-semibold">Page could not load</h1>
          <p className="mt-2 text-sm text-[#5d6572]">
            Something interrupted loading this screen. Tap below to reload cintiQ.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-[#0e5c63] px-4 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-[#e2e0d8] px-4 py-2 text-sm font-medium"
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
