import Link from "next/link";
import Image from "next/image";
import { requireActiveSeller } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { formatKobo } from "@/lib/utils";
import { firstImage, type ProductRow } from "@/lib/types";
import { productImageUrl } from "@/lib/storage";

export const metadata = { title: "My products" };

export default async function SellerProducts({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const seller = await requireActiveSeller("/seller/products");
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products").select("*, product_images(storage_path,sort_order), categories(name,slug)")
    .eq("seller_id", seller.id).order("created_at", { ascending: false });
  const products = (data ?? []) as ProductRow[];
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">My products</h1>
        <Button asChild><Link href="/seller/products/new">Add product</Link></Button>
      </div>
      {deleted && <p role="status" className="mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-success">Product deleted.</p>}
      {products.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium">You have not added any products yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Add your first product to start selling.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {products.map((p) => {
            const img = firstImage(p);
            return (
              <li key={p.id}>
                <Link href={`/seller/products/${p.id}`} className="flex items-center gap-4 p-3 hover:bg-muted/50">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                    {img && <Image src={productImageUrl(img)} alt="" fill sizes="56px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{formatKobo(p.price_kobo)} · {p.quantity} in stock</p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
