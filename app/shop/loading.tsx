export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8" aria-busy="true" aria-label="Loading products">
      <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-10 animate-pulse rounded bg-muted" />
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="aspect-square animate-pulse bg-muted" />
            <div className="space-y-2 p-3"><div className="h-4 animate-pulse rounded bg-muted" /><div className="h-4 w-1/2 animate-pulse rounded bg-muted" /></div>
          </div>
        ))}
      </div>
    </main>
  );
}
