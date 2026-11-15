import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { moderateProductAction } from "@/lib/products/actions";
import { formatKobo } from "@/lib/utils";
import type { ProductRow } from "@/lib/types";

export const metadata = { title: "Products" };

export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole(["admin"], "/admin/products");
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products").select("*, seller_profiles(store_name,slug)").neq("status", "draft").order("created_at", { ascending: false }).limit(100);
  const products = (data ?? []) as ProductRow[];
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Products</h1>
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
      {products.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No products have been published yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <Link href={`/products/${p.id}`} className="block truncate text-sm font-medium hover:underline">{p.name}</Link>
                <p className="text-xs text-muted-foreground">{p.seller_profiles?.store_name} · {formatKobo(p.price_kobo)} · {p.quantity} in stock</p>
              </div>
              <StatusBadge status={p.status} />
              {p.is_featured && <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-medium">Featured</span>}
              {p.status === "active" && (
                <form action={moderateProductAction.bind(null, p.id, { featured: !p.is_featured })}>
                  <Button type="submit" variant="outline" className="h-9">{p.is_featured ? "Unfeature" : "Feature"}</Button>
                </form>
              )}
              <form action={moderateProductAction.bind(null, p.id, { status: p.status === "suspended" ? "active" : "suspended" })}>
                <Button type="submit" variant={p.status === "suspended" ? "outline" : "danger"} className="h-9">{p.status === "suspended" ? "Reinstate" : "Suspend"}</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
