import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/shop/product-card";
import type { Category, ProductRow } from "@/lib/types";

export const metadata = { title: "Shop" };
const PAGE_SIZE = 12;
const SORTS = { newest: "Newest", price_asc: "Price: low to high", price_desc: "Price: high to low" } as const;
type Sort = keyof typeof SORTS;

/** Keep letters, numbers, spaces and hyphens only: safe for PostgREST filter strings. */
const cleanQuery = (q: string) => q.replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export default async function Shop({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = cleanQuery(sp.q ?? "");
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : "newest";
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
  query = sort === "price_asc" ? query.order("price_kobo", { ascending: true })
    : sort === "price_desc" ? query.order("price_kobo", { ascending: false })
    : query.order("created_at", { ascending: false });
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const products = (data ?? []) as ProductRow[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: q || undefined, category: category?.slug, sort: sort === "newest" ? undefined : sort, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/shop${s ? `?${s}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">Shop</h1>
      <form action="/shop" className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">Search products</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search products" className="h-10 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm" />
        {category && <input type="hidden" name="category" value={category.slug} />}
        <label htmlFor="sort" className="sr-only">Sort</label>
        <select id="sort" name="sort" defaultValue={sort} className="h-10 rounded-md border border-border bg-card px-2 text-sm">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" className="h-10 rounded-md bg-brand px-4 text-sm font-medium text-white">Search</button>
      </form>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Categories">
        <Link href={href({ category: undefined, page: undefined })} className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${!category ? "border-brand bg-brand text-white" : "border-border bg-card"}`}>All</Link>
        {categories.map((c) => (
          <Link key={c.id} href={href({ category: c.slug, page: undefined })} className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${category?.id === c.id ? "border-brand bg-brand text-white" : "border-border bg-card"}`}>{c.name}</Link>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-10 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">We could not load products right now. Please try again.</p>
      ) : products.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-medium">{q || category ? "No products match your search." : "No products are available yet."}</p>
          {(q || category) && <Link href="/shop" className="mt-2 inline-block text-sm text-brand underline">Clear filters</Link>}
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">{count} product{count === 1 ? "" : "s"}</p>
          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
