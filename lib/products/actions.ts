"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireActiveSeller, requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { productSchema } from "@/lib/validation/product";
import { filesFrom, validateUpload } from "@/lib/uploads";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/auth/actions";

async function uploadImages(sellerId: string, productId: string, files: File[], startOrder: number) {
  const supabase = await createClient();
  for (const [i, file] of files.entries()) {
    const v = await validateUpload(file, "image");
    if (!v.ok) return `${file.name}: ${v.error}`;
    const path = `${sellerId}/${productId}/${randomUUID()}.${v.ext}`;
    const up = await supabase.storage.from("product-images").upload(path, v.bytes, { contentType: v.mime });
    if (up.error) return `${file.name}: upload failed`;
    const ins = await supabase.from("product_images").insert({ product_id: productId, storage_path: path, sort_order: startOrder + i });
    if (ins.error) {
      await supabase.storage.from("product-images").remove([path]);
      return ins.error.message.includes("at most 6") ? "A product can have at most 6 images." : `${file.name}: could not be saved`;
    }
  }
  return null;
}

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seller = await requireActiveSeller("/seller/products/new");
  const parsed = productSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const files = filesFrom(fd, "images");
  if (files.length > 6) return { ok: false, fieldErrors: { images: ["At most 6 images"] } };
  if (d.status === "active" && files.length === 0)
    return { ok: false, fieldErrors: { images: ["Add at least one image to publish this product"] } };

  const supabase = await createClient();
  const { data: cat } = await supabase.from("categories").select("id").eq("id", d.categoryId).eq("is_active", true).maybeSingle();
  if (!cat) return { ok: false, fieldErrors: { categoryId: ["Select a valid category"] } };

  // Create as draft first so a failed image upload never leaves a live, image-less listing.
  const { data: product, error } = await supabase
    .from("products")
    .insert({ seller_id: seller.id, category_id: d.categoryId, name: d.name, description: d.description, price_kobo: d.price, quantity: d.quantity, status: "draft" })
    .select("id")
    .single();
  if (error || !product) return { ok: false, message: "Could not create the product." };

  const imgErr = await uploadImages(seller.id, product.id, files, 0);
  if (imgErr) {
    revalidatePath("/seller/products");
    redirect(`/seller/products/${product.id}?error=${encodeURIComponent(imgErr)}`);
  }
  if (d.status === "active") {
    const { error: pubErr } = await supabase.from("products").update({ status: "active" }).eq("id", product.id);
    if (pubErr) redirect(`/seller/products/${product.id}?error=${encodeURIComponent("Could not publish the product.")}`);
  }
  await audit(seller.id, "product.create", "product", product.id, { status: d.status });
  revalidatePath("/seller/products");
  revalidatePath("/shop");
  redirect(`/seller/products/${product.id}?saved=1`);
}

export async function updateProductAction(productId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const seller = await requireActiveSeller(`/seller/products/${productId}`);
  const parsed = productSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("products").select("id,status,product_images(id)").eq("id", productId).eq("seller_id", seller.id).maybeSingle();
  if (!existing) return { ok: false, message: "Product not found." };
  if (existing.status === "suspended") return { ok: false, message: "This product was suspended by an administrator." };

  const files = filesFrom(fd, "images");
  const existingCount = existing.product_images?.length ?? 0;
  if (existingCount + files.length > 6) return { ok: false, fieldErrors: { images: [`At most 6 images (you have ${existingCount})`] } };
  if (d.status === "active" && existingCount + files.length === 0)
    return { ok: false, fieldErrors: { images: ["Add at least one image to publish this product"] } };

  const { data: cat } = await supabase.from("categories").select("id").eq("id", d.categoryId).eq("is_active", true).maybeSingle();
  if (!cat) return { ok: false, fieldErrors: { categoryId: ["Select a valid category"] } };

  const imgErr = await uploadImages(seller.id, productId, files, existingCount);
  if (imgErr) return { ok: false, fieldErrors: { images: [imgErr] } };

  const { error } = await supabase.from("products")
    .update({ category_id: d.categoryId, name: d.name, description: d.description, price_kobo: d.price, quantity: d.quantity, status: d.status })
    .eq("id", productId).eq("seller_id", seller.id);
  if (error) return { ok: false, message: "Could not save the product." };

  await audit(seller.id, "product.update", "product", productId, { status: d.status });
  revalidatePath("/seller/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/shop");
  return { ok: true, message: "Product saved." };
}

export async function deleteImageAction(productId: string, imageId: string) {
  const seller = await requireActiveSeller();
  const supabase = await createClient();
  const { data: img } = await supabase
    .from("product_images").select("id,storage_path,products!inner(seller_id,status)").eq("id", imageId).eq("product_id", productId).maybeSingle();
  if (img) {
    const product = (img as unknown as { products: { seller_id: string; status: string } }).products;
    if (product.seller_id === seller.id) {
      await supabase.from("product_images").delete().eq("id", imageId);
      await supabase.storage.from("product-images").remove([img.storage_path]);
    }
  }
  revalidatePath(`/seller/products/${productId}`);
  redirect(`/seller/products/${productId}`);
}

export async function deleteProductAction(productId: string) {
  const seller = await requireActiveSeller();
  const supabase = await createClient();
  const { data: imgs } = await supabase.from("product_images").select("storage_path").eq("product_id", productId);
  const { error } = await supabase.from("products").delete().eq("id", productId).eq("seller_id", seller.id);
  if (error) redirect(`/seller/products/${productId}?error=${encodeURIComponent("This product cannot be deleted (it may have orders). Archive it instead.")}`);
  if (imgs?.length) await supabase.storage.from("product-images").remove(imgs.map((i) => i.storage_path));
  await audit(seller.id, "product.delete", "product", productId);
  revalidatePath("/seller/products");
  revalidatePath("/shop");
  redirect("/seller/products?deleted=1");
}

export async function moderateProductAction(productId: string, change: { status?: "active" | "suspended" | "archived"; featured?: boolean }) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_moderate_product", {
    _id: productId, _status: change.status ?? null, _featured: change.featured ?? null,
  });
  if (error) redirect(`/admin/products?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath(`/products/${productId}`);
  redirect("/admin/products");
}
