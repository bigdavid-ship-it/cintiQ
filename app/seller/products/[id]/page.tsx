import { notFound } from "next/navigation";
import Image from "next/image";
import { requireActiveSeller } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/seller/product-form";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { deleteImageAction, deleteProductAction, updateProductAction } from "@/lib/products/actions";
import { koboToNairaString } from "@/lib/money";
import { isVideoPath, productImageUrl } from "@/lib/storage";
import type { ProductRow } from "@/lib/types";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const seller = await requireActiveSeller(`/seller/products/${id}`);
  const supabase = await createClient();
  const [{ data }, { data: categories }] = await Promise.all([
    supabase.from("products").select("*, product_images(id,storage_path,sort_order)").eq("id", id).eq("seller_id", seller.id).maybeSingle(),
    supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order"),
  ]);
  if (!data) notFound();
  const p = data as ProductRow & { product_images: { id: string; storage_path: string; sort_order: number }[] };
  const images = [...p.product_images].sort((a, b) => a.sort_order - b.sort_order);
  const suspended = p.status === "suspended";
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Edit product</h1>
        <StatusBadge status={p.status} />
      </div>
      {sp.error && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{sp.error}</p>}
      {sp.saved && <p role="status" className="mb-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-success">Product created.</p>}
      {suspended && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">This product was suspended by an administrator and cannot be edited.</p>}
      {images.length > 0 && (
        <ul className="mb-6 grid grid-cols-3 gap-3">
          {images.map((img) => (
            <li key={img.id} className="space-y-1">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                {isVideoPath(img.storage_path) ? (
                  <video src={productImageUrl(img.storage_path)} controls muted playsInline preload="metadata" className="h-full w-full bg-black object-cover" />
                ) : (
                  <Image src={productImageUrl(img.storage_path)} alt="" fill sizes="150px" className="object-cover" />
                )}
              </div>
              {!suspended && (
                <form action={deleteImageAction.bind(null, p.id, img.id)}><Button type="submit" variant="ghost" className="h-8 w-full text-xs">Remove</Button></form>
              )}
            </li>
          ))}
        </ul>
      )}
      {!suspended && (
        <>
          <ProductForm
            action={updateProductAction.bind(null, p.id)}
            categories={categories ?? []}
            imagesLeft={6 - images.length}
            submitLabel="Save changes"
            product={{ name: p.name, description: p.description, priceNaira: koboToNairaString(p.price_kobo), quantity: p.quantity, categoryId: p.category_id, status: p.status }}
          />
          <form action={deleteProductAction.bind(null, p.id)} className="mt-10 border-t border-border pt-6">
            <p className="mb-2 text-sm text-muted-foreground">Deleting is permanent. Products with orders cannot be deleted; archive them instead.</p>
            <Button type="submit" variant="danger">Delete product</Button>
          </form>
        </>
      )}
    </main>
  );
}
