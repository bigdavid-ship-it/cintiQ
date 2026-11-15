import { requireActiveSeller } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/seller/product-form";
import { createProductAction } from "@/lib/products/actions";

export const metadata = { title: "Add product" };

export default async function NewProduct() {
  await requireActiveSeller("/seller/products/new");
  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order");
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display mb-6 text-2xl font-semibold">Add product</h1>
      <ProductForm action={createProductAction} categories={categories ?? []} imagesLeft={6} submitLabel="Create product" />
    </main>
  );
}
