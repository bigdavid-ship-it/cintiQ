import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/shop/product-card";
import type { ProductRow } from "@/lib/types";

export const metadata = { title: "Saved products" };

export default async function SavedProductsPage() {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/account/saved");
  const supabase = await createClient();

  const { data } = await supabase
    .from("saved_products")
    .select("product_id, products(*, product_images(storage_path,sort_order), seller_profiles(store_name,slug), categories(name,slug))")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const products = (data ?? [])
    .map((r) => r.products as unknown as ProductRow | null)
    .filter((p): p is ProductRow => p !== null);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/account" className="text-sm text-brand hover:underline">← Back to account</Link>
      <h1 className="font-display mt-1 text-2xl font-semibold">Saved products</h1>
      {products.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          You have not saved any products yet.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </main>
  );
}
