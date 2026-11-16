import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-xs">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">404</p>
        <h1 className="font-display mt-1 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page or order you&apos;re looking for may have moved or doesn&apos;t exist.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/orders">View orders</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
