import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import { reconcilePaystackReference } from "@/lib/payments/service";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Payment status" };

export default async function CheckoutCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/orders");
  const sp = await searchParams;
  const reference = sp.reference ?? sp.trxref;

  if (!reference) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Missing payment reference</h1>
        <Button asChild className="mt-6"><Link href="/orders">View orders</Link></Button>
      </main>
    );
  }

  if (!isConfigured("PAYSTACK_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Payment gateway not configured</h1>
        <p className="mt-2 text-sm text-muted-foreground">PAYSTACK_SECRET_KEY is not set on the server.</p>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: checkout } = await supabase
    .from("checkouts")
    .select("id")
    .eq("reference", reference)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: checkoutOrders } = checkout
    ? await supabase.from("orders").select("id").eq("checkout_id", checkout.id).limit(2)
    : { data: null };
  const singleOrderId = checkoutOrders?.length === 1 ? checkoutOrders[0].id : null;

  let title = "Payment verified";
  let body = "Your payment is confirmed and your sellers have been notified.";
  let ok = true;

  try {
    const res = await reconcilePaystackReference(reference);
    if (res.status === "paid_refund_required") {
      title = "Payment received — items unavailable";
      body = "Your payment arrived after the reservation expired and items are out of stock. A refund has been flagged for an administrator.";
      ok = false;
    } else if (res.status === "failed" || res.status === "abandoned" || res.status === "amount_mismatch") {
      title = "Payment not completed";
      body = res.reason ?? "No payment was confirmed. Your reserved stock has been released.";
      ok = false;
    } else if (res.status === "unknown_reference") {
      title = "Order reference not found";
      body = "We could not match this payment reference to an order.";
      ok = false;
    }
  } catch (err) {
    title = "Could not verify payment";
    body = err instanceof Error ? err.message : "Please check your order status in a moment.";
    ok = false;
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className={`mt-3 text-sm ${ok ? "text-muted-foreground" : "text-danger"}`}>{body}</p>
      <p className="mt-2 text-xs text-muted-foreground">Reference: {reference}</p>
      <div className="mt-8 flex justify-center gap-3">
        {singleOrderId ? (
          <Button asChild><Link href={`/orders/${singleOrderId}`}>View order</Link></Button>
        ) : (
          <Button asChild><Link href="/orders">View orders</Link></Button>
        )}
        {!ok && <Button asChild variant="outline"><Link href="/cart">Back to cart</Link></Button>}
      </div>
    </main>
  );
}
