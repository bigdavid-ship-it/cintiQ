import Link from "next/link";
import { ArrowRight, Search, Sparkles, Store, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/shop/product-card";
import { CategoryMarquee } from "@/components/shop/category-marquee";
import { shuffleArray } from "@/lib/shuffle";
import { Button } from "@/components/ui/button";
import type { Category, ProductRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore marketplace" };
const PAGE_SIZE = 12;
const SORTS = {
  shuffle: "Recommended",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
} as const;
type Sort = keyof typeof SORTS;

const cleanQuery = (q: string) => q.replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = cleanQuery(sp.q ?? "");
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : "shuffle";
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? "1", 10) || 1));
  const supabase = await createClient();

  const { data: cats } = await supabase.from("categories").select("id,name,slug").eq("is_active", true).order("sort_order");
  const categories = (cats ?? []) as Pick<Category, "id" | "name" | "slug">[];
  const category = categories.find((c) => c.slug === sp.category);

  let query = supabase
    .from("products")
    .select("*, product_images(storage_path,sort_order), seller_profiles(store_name,slug), categories(name,slug)", { count: "exact" })
    .eq("status", "active");
  if (category) query = query.eq("category_id", category.id);
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);

  let products: ProductRow[] = [];
  let count: number | null = 0;
  let error: unknown = null;

  if (sort === "shuffle") {
    const res = await query.limit(200);
    error = res.error;
    count = res.count ?? res.data?.length ?? 0;
    const shuffled = shuffleArray((res.data ?? []) as ProductRow[]);
    products = shuffled.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    query =
      sort === "price_asc"
        ? query.order("price_kobo", { ascending: true })
        : sort === "price_desc"
          ? query.order("price_kobo", { ascending: false })
          : query.order("created_at", { ascending: false });

    const res = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    error = res.error;
    count = res.count;
    products = (res.data ?? []) as ProductRow[];
  }

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: q || undefined, category: category?.slug, sort: sort === "shuffle" ? undefined : sort, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/explore${s ? `?${s}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <section className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-brand-soft/45 p-5 shadow-xs sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
              <Sparkles className="size-3.5" aria-hidden />
              Campus Marketplace
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {category ? category.name : "Explore marketplace"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {category
                ? `Discover verified campus listings in ${category.name}.`
                : "Freshly shuffled listings from verified student entrepreneurs and campus businesses."}
            </p>
          </div>
          <Link
            href="/sellers"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-xs font-medium transition-colors hover:border-brand hover:text-brand"
          >
            <Store className="size-3.5 text-brand" aria-hidden />
            Verified sellers
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        <form action="/explore" className="mt-5 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <label htmlFor="q" className="sr-only">Search products</label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Search laptops, meals, fashion, skincare, services..."
              className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm focus:bg-card"
            />
          </div>
          {category && <input type="hidden" name="category" value={category.slug} />}
          <div className="flex gap-2">
            <label htmlFor="sort" className="sr-only">Sort</label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium focus:bg-card"
            >
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <Button type="submit" className="h-11 px-5">Search</Button>
          </div>
        </form>

        <CategoryMarquee
          categories={categories}
          activeSlug={category?.slug}
          allLabel="All"
          searchQuery={q || undefined}
          sort={sort}
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {!error && (
            <span className="font-medium text-foreground">
              {count ?? 0} product{count === 1 ? "" : "s"}
            </span>
          )}
          {q && (
            <Link
              href={href({ q: undefined, page: undefined })}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-foreground hover:border-brand"
            >
              “{q}” <X className="size-3" aria-hidden />
            </Link>
          )}
          {category && (
            <Link
              href={href({ category: undefined, page: undefined })}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-foreground hover:border-brand"
            >
              {category.name} <X className="size-3" aria-hidden />
            </Link>
          )}
        </div>
        {(q || category) && (
          <Link href="/explore" className="text-xs font-medium text-brand hover:underline">
            Reset all filters
          </Link>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
          We could not load products right now. Please try again.
        </p>
      ) : products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="font-display text-base font-semibold">
            {q || category ? "No products match your search." : "No products are available yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || category
              ? "Try a different keyword or browse all campus categories."
              : "Verified campus sellers are adding inventory soon."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(q || category) && (
              <Button asChild variant="outline">
                <Link href="/explore">View all products</Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/sellers">Browse verified sellers</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
              {page > 1 && <Link href={href({ page: String(page - 1) })} className="text-brand underline">Previous</Link>}
              <span>Page {page} of {pages}</span>
              {page < pages && <Link href={href({ page: String(page + 1) })} className="text-brand underline">Next</Link>}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
