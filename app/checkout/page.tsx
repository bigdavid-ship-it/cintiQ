import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { formatKobo } from "@/lib/utils";

export const metadata = { title: "Checkout" };

type CartLine = {
  id: string;
  quantity: number;
  products: {
    id: string;
    name: string;
    price_kobo: number;
    seller_id: string;
    seller_profiles: { store_name: string } | null;
  } | null;
};

export default async function CheckoutPage() {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/checkout");
  const supabase = await createClient();

  const [{ data: cart }, { data: addresses }, { data: profile }, { data: feeSetting }] = await Promise.all([
    supabase
      .from("carts")
      .select("id, cart_items(id, quantity, products(id, name, price_kobo, seller_id, seller_profiles(store_name)))")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("delivery_addresses").select("id,label,recipient_name,phone,address").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
    supabase.from("platform_settings").select("value").eq("key", "delivery_fee_kobo").maybeSingle(),
  ]);

  const items = ((cart as { cart_items?: CartLine[] } | null)?.cart_items ?? []).filter((i) => i.products !== null);
  if (items.length === 0) redirect("/cart");

  const sellers = new Set(items.map((i) => i.products!.seller_id));
  const subtotal = items.reduce((s, i) => s + i.products!.price_kobo * i.quantity, 0);
  const deliveryFeeEach = Number(feeSetting?.value ?? 0) || 0;
  const paystackConfigured = isConfigured("PAYSTACK_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Checkout</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-5">
        <div className="md:col-span-3">
          <CheckoutForm
            idempotencyKey={randomUUID()}
            addresses={addresses ?? []}
            defaults={{ name: user.fullName, phone: profile?.phone ?? "" }}
            subtotalKobo={subtotal}
            deliveryFeeEachKobo={deliveryFeeEach}
            sellerCount={sellers.size}
            paystackConfigured={paystackConfigured}
          />
        </div>
        <aside className="space-y-4 md:col-span-2">
          <h2 className="font-display text-lg font-semibold">Order summary</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.products!.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.products!.seller_profiles?.store_name} · Qty {i.quantity}
                  </p>
                </div>
                <span className="shrink-0 font-medium">{formatKobo(i.products!.price_kobo * i.quantity)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
