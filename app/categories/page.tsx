import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug, description")
    .eq("is_active", true)
    .order("sort_order");

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Categories</h1>
      <p className="mt-1 text-sm text-muted-foreground">Browse products and services across campus.</p>

      {!categories?.length ? (
        <p className="mt-8 text-sm text-muted-foreground">No active categories.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/explore?category=${c.slug}`}
              className="rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <h2 className="font-display text-base font-semibold">{c.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{c.description ?? "Explore listings in this category"}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
