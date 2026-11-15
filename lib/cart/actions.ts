"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addressSchema, cartAddSchema, cartUpdateSchema } from "@/lib/validation/checkout";
import type { ActionState } from "@/lib/auth/actions";

async function getOrCreateCartId(userId: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("carts").select("id").eq("user_id", userId).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase.from("carts").insert({ user_id: userId }).select("id").single();
  if (error || !created) throw new Error("Could not initialize cart");
  return created.id;
}

export async function addToCartAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"]);
  const parsed = cartAddSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: "Invalid quantity or product." };
  const { productId, quantity } = parsed.data;

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id,seller_id,quantity,status")
    .eq("id", productId)
    .maybeSingle();

  if (!product || product.status !== "active") {
    return { ok: false, message: "This product is no longer available." };
  }
  if (product.seller_id === user.id) {
    return { ok: false, message: "You cannot add your own product to your cart." };
  }
  if (product.quantity < quantity) {
    return { ok: false, message: product.quantity === 0 ? "This product is out of stock." : `Only ${product.quantity} left in stock.` };
  }

  const cartId = await getOrCreateCartId(user.id);
  const { data: existingItem } = await supabase
    .from("cart_items")
    .select("id,quantity")
    .eq("cart_id", cartId)
    .eq("product_id", productId)
    .maybeSingle();

  const nextQty = (existingItem?.quantity ?? 0) + quantity;
  if (nextQty > product.quantity) {
    return { ok: false, message: `Only ${product.quantity} available (you already have ${existingItem?.quantity ?? 0} in your cart).` };
  }
  if (nextQty > 99) {
    return { ok: false, message: "Maximum 99 units per product." };
  }

  const { error } = existingItem
    ? await supabase.from("cart_items").update({ quantity: nextQty }).eq("id", existingItem.id)
    : await supabase.from("cart_items").insert({ cart_id: cartId, product_id: productId, quantity: nextQty });

  if (error) return { ok: false, message: "Could not add item to cart." };

  revalidatePath("/cart");
  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Added to cart." };
}

export async function updateCartItemAction(fd: FormData) {
  await requireRole(["customer", "seller", "admin", "super_admin"], "/cart");
  const parsed = cartUpdateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return;
  const supabase = await createClient();
  if (parsed.data.quantity === 0) {
    await supabase.from("cart_items").delete().eq("id", parsed.data.itemId);
  } else {
    await supabase.from("cart_items").update({ quantity: parsed.data.quantity }).eq("id", parsed.data.itemId);
  }
  revalidatePath("/cart");
}

export async function removeCartItemAction(itemId: string) {
  await requireRole(["customer", "seller", "admin", "super_admin"], "/cart");
  const supabase = await createClient();
  await supabase.from("cart_items").delete().eq("id", itemId);
  revalidatePath("/cart");
}

export async function saveAddressAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/account");
  const parsed = addressSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_addresses").insert({
    user_id: user.id,
    label: parsed.data.label,
    recipient_name: parsed.data.recipientName,
    phone: parsed.data.phone,
    address: parsed.data.address,
  });
  if (error) return { ok: false, message: "Could not save address." };
  revalidatePath("/account");
  revalidatePath("/checkout");
  redirect("/");
}

export async function deleteAddressAction(id: string) {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/account");
  const supabase = await createClient();
  await supabase.from("delivery_addresses").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/account");
  revalidatePath("/checkout");
}
