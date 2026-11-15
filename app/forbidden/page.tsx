import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">You do not have permission to view this page.</p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-brand underline">Back to home</Link>
    </main>
  );
}
