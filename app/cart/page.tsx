import Link from "next/link";
import Image from "next/image";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { formatKobo } from "@/lib/utils";
import { isVideoPath, productImageUrl } from "@/lib/storage";
import { removeCartItemAction, updateCartItemAction } from "@/lib/cart/actions";

export const metadata = { title: "Shopping cart" };

type CartItemRow = {
  id: string;
  quantity: number;
  products: {
    id: string;
    name: string;
    price_kobo: number;
    quantity: number;
    status: string;
    seller_id: string;
    product_images: { storage_path: string; sort_order: number }[];
    seller_profiles: { store_name: string; slug: string } | null;
  } | null;
};

export default async function CartPage() {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/cart");
  const supabase = await createClient();
  const [{ data: cart }, { data: feeSetting }] = await Promise.all([
    supabase
      .from("carts")
      .select(
        "id, cart_items(id, quantity, products(id, name, price_kobo, quantity, status, seller_id, product_images(storage_path, sort_order), seller_profiles(store_name, slug)))",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("platform_settings").select("value").eq("key", "delivery_fee_kobo").maybeSingle(),
  ]);

  const items = ((cart as { cart_items?: CartItemRow[] } | null)?.cart_items ?? []).filter((i) => i.products !== null);
  const deliveryFeeEach = Number(feeSetting?.value ?? 0) || 0;

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-2xl font-semibold">Shopping cart</h1>
        <div className="mt-8 rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-medium">Your cart is empty.</p>
          <p className="mt-1 text-sm text-muted-foreground">Browse products from verified campus sellers.</p>
          <Button asChild className="mt-6">
            <Link href="/shop">Browse shop</Link>
          </Button>
        </div>
      </main>
    );
  }

  // Group items by seller
  const bySeller = new Map<string, { storeName: string; slug: string; items: CartItemRow[] }>();
  let subtotal = 0;
  let hasUnavailable = false;

  for (const item of items) {
    const p = item.products!;
    const ok = p.status === "active" && p.quantity >= item.quantity;
    if (!ok) hasUnavailable = true;
    subtotal += p.price_kobo * item.quantity;
    const group = bySeller.get(p.seller_id) ?? {
      storeName: p.seller_profiles?.store_name ?? "Seller",
      slug: p.seller_profiles?.slug ?? "",
      items: [],
    };
    group.items.push(item);
    bySeller.set(p.seller_id, group);
  }

  const sellerCount = bySeller.size;
  const deliveryTotal = deliveryFeeEach * sellerCount;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Shopping cart</h1>
      {sellerCount > 1 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Your cart contains items from {sellerCount} sellers. Checkout will create {sellerCount} separate seller orders under one payment.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {[...bySeller.entries()].map(([sellerId, group]) => (
          <section key={sellerId} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              Seller:{" "}
              {group.slug ? (
                <Link href={`/sellers/${group.slug}`} className="text-brand hover:underline">
                  {group.storeName}
                </Link>
              ) : (
                group.storeName
              )}
            </div>
            <ul className="divide-y divide-border">
              {group.items.map((item) => {
                const p = item.products!;
                const img = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).find((m) => !isVideoPath(m.storage_path))?.storage_path;
                const stockProblem =
                  p.status !== "active"
                    ? "No longer available"
                    : p.quantity === 0
                      ? "Out of stock"
                      : p.quantity < item.quantity
                        ? `Only ${p.quantity} left in stock`
                        : null;

                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                      {img && <Image src={productImageUrl(img)} alt={p.name} fill sizes="64px" className="object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/products/${p.id}`} className="block truncate text-sm font-medium hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-sm text-muted-foreground">{formatKobo(p.price_kobo)} each</p>
                      {stockProblem && <p className="mt-1 text-xs font-medium text-danger">{stockProblem}</p>}
                    </div>
                    <form action={updateCartItemAction} className="flex items-center gap-2">
                      <input type="hidden" name="itemId" value={item.id} />
                      <label htmlFor={`q-${item.id}`} className="sr-only">Quantity</label>
                      <input
                        id={`q-${item.id}`}
                        name="quantity"
                        type="number"
                        min={1}
                        max={Math.max(1, Math.min(99, p.quantity))}
                        defaultValue={item.quantity}
                        className="h-9 w-16 rounded-md border border-border px-2 text-sm"
                      />
                      <Button type="submit" variant="outline" className="h-9 px-3 text-xs">
                        Update
                      </Button>
                    </form>
                    <p className="w-24 text-right font-display text-sm font-semibold">
                      {formatKobo(p.price_kobo * item.quantity)}
                    </p>
                    <form action={removeCartItemAction.bind(null, item.id)}>
                      <Button type="submit" variant="ghost" className="h-9 px-2 text-xs text-danger">
                        Remove
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-medium">{formatKobo(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery ({sellerCount} seller{sellerCount === 1 ? "" : "s"})</dt>
            <dd className="font-medium">{deliveryTotal === 0 ? "Free / Collection" : formatKobo(deliveryTotal)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Estimated total (delivery)</dt>
            <dd className="font-display">{formatKobo(subtotal + deliveryTotal)}</dd>
          </div>
        </dl>
        {hasUnavailable ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
            Update or remove unavailable items before proceeding to checkout.
          </p>
        ) : (
          <div className="mt-6 flex justify-end">
            <Button asChild>
              <Link href="/checkout">Proceed to checkout</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
