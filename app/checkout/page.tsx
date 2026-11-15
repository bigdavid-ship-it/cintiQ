import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import { reconcilePaystackReference } from "@/lib/payments/service";
import { cancelCheckoutAction } from "@/lib/checkout/actions";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { Button } from "@/components/ui/button";
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
  const paystackConfigured = isConfigured("PAYSTACK_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");

  if (items.length === 0) {
    // If the user started a checkout and left before finishing, let them resume from here
    const { data: pendingCheckout } = await supabase
      .from("checkouts")
      .select("id, reference, total_kobo, expires_at, payments(authorization_url)")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pendingCheckout) redirect("/cart");

    if (paystackConfigured) {
      try {
        const res = await reconcilePaystackReference(pendingCheckout.reference);
        if (res.status === "confirmed" || res.status === "already_processed") {
          redirect(`/checkout/callback?reference=${encodeURIComponent(pendingCheckout.reference)}`);
        }
      } catch {
        // Continue to show resume card if Paystack check fails transiently
      }
    }

    const authUrl = (pendingCheckout.payments as unknown as { authorization_url: string | null }[] | null)?.[0]?.authorization_url;
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <h1 className="font-display text-2xl font-semibold">Resume your checkout</h1>
          <p className="text-sm text-muted-foreground">
            You have a pending checkout (<span className="font-mono text-foreground">{pendingCheckout.reference}</span>) for{" "}
            <strong className="text-foreground">{formatKobo(pendingCheckout.total_kobo)}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Reserved until {new Date(pendingCheckout.expires_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {authUrl && (
              <Button asChild className="flex-1">
                <a href={authUrl}>Continue to Paystack</a>
              </Button>
            )}
            <form action={cancelCheckoutAction.bind(null, pendingCheckout.id)}>
              <Button type="submit" variant="outline">Cancel &amp; return to cart</Button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const sellers = new Set(items.map((i) => i.products!.seller_id));
  const subtotal = items.reduce((s, i) => s + i.products!.price_kobo * i.quantity, 0);
  const deliveryFeeEach = Number(feeSetting?.value ?? 0) || 0;

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
