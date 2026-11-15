import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/shop/product-card";
import { ShareStoreLink } from "@/components/seller/share-store-link";
import type { ProductRow } from "@/lib/types";

export default async function Storefront({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: store } = await supabase
    .from("seller_profiles").select("user_id,store_name,slug,description,location,seller_type,created_at")
    .eq("slug", slug).eq("status", "active").maybeSingle();
  if (!store) notFound();
  const { data } = await supabase
    .from("products").select("*, product_images(storage_path,sort_order), seller_profiles(store_name,slug), categories(name,slug)")
    .eq("seller_id", store.user_id).eq("status", "active").order("created_at", { ascending: false });
  const products = (data ?? []) as ProductRow[];
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">{store.store_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {store.seller_type === "student" ? "Student entrepreneur" : "Local business"} · {store.location} · Verified seller
          </p>
          {store.description && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm">{store.description}</p>}
        </div>
        <div className="w-full md:w-80">
          <ShareStoreLink slug={store.slug} storeName={store.store_name} />
        </div>
      </div>

      <h2 className="font-display mt-8 text-lg font-semibold">Full inventory ({products.length})</h2>
      {products.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">This store has no products listed yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      )}
    </main>
  );
}
