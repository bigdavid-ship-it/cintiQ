import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";
import { Button } from "@/components/ui/button";
import { CustomerOrderControls } from "@/components/orders/customer-order-controls";
import { formatKobo } from "@/lib/utils";
import { cancelCheckoutAction } from "@/lib/checkout/actions";
import type { OrderStatus } from "@/lib/orders/transitions";

export const metadata = { title: "Order details" };

export default async function CheckoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], `/orders/${id}`);
  const supabase = await createClient();

  const { data: checkout } = await supabase
    .from("checkouts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!checkout) notFound();

  const [{ data: orders }, { data: payment }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, seller_profiles(store_name, slug), order_items(*), disputes(id, status, reason, resolution_note), reviews(id, rating), order_status_history(to_status, note, created_at)")
      .eq("checkout_id", id)
      .order("created_at"),
    supabase.from("payments").select("reference, status, channel, paid_at, authorization_url").eq("checkout_id", id).maybeSingle(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/orders" className="text-sm text-brand hover:underline">← Back to orders</Link>
          <h1 className="font-display mt-1 text-2xl font-semibold">Order {checkout.reference}</h1>
          <p className="text-sm text-muted-foreground">Placed {new Date(checkout.created_at).toLocaleString("en-NG")}</p>
        </div>
        <StatusBadge status={checkout.status} />
      </div>

      {checkout.status === "pending_payment" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p>Awaiting payment confirmation. Stock reservation expires at {new Date(checkout.expires_at).toLocaleTimeString("en-NG")}.</p>
          <div className="flex gap-2">
            {payment?.authorization_url && (
              <Button asChild><a href={payment.authorization_url}>Complete payment</a></Button>
            )}
            <form action={cancelCheckoutAction.bind(null, checkout.id)}>
              <Button type="submit" variant="outline">Cancel checkout</Button>
            </form>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="font-display mb-2 text-base font-semibold">Delivery &amp; contact</h2>
          <p><strong>Method:</strong> {checkout.fulfilment_method}</p>
          <p><strong>Recipient:</strong> {checkout.recipient_name}</p>
          <p><strong>Phone:</strong> {checkout.recipient_phone}</p>
          <p><strong>Address:</strong> {checkout.delivery_address}</p>
          {checkout.notes && <p className="mt-2 text-muted-foreground">Note: {checkout.notes}</p>}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="font-display mb-2 text-base font-semibold">Payment summary</h2>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatKobo(checkout.subtotal_kobo)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{formatKobo(checkout.delivery_fee_kobo)}</dd></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd>{formatKobo(checkout.total_kobo)}</dd></div>
            {payment && (
              <div className="flex justify-between pt-2 text-xs text-muted-foreground">
                <dt>Payment status</dt>
                <dd className="capitalize">{payment.status.replace(/_/g, " ")}{payment.channel ? ` (${payment.channel})` : ""}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <h2 className="font-display mt-8 text-lg font-semibold">Seller fulfilment orders</h2>
      <div className="mt-3 space-y-6">
        {(orders ?? []).map((o) => {
          const seller = o.seller_profiles as unknown as { store_name: string; slug: string } | null;
          const items = (o.order_items ?? []) as unknown as { id: string; product_name: string; unit_price_kobo: number; quantity: number; line_total_kobo: number }[];
          const dispute = (o.disputes as unknown as { id: string; status: string; reason: string; resolution_note: string | null }[] | null)?.[0] ?? null;
          const review = (o.reviews as unknown as { id: string; rating: number }[] | null)?.[0] ?? null;
          const history = (o.order_status_history ?? []) as unknown as { to_status: string; note: string | null; created_at: string }[];

          return (
            <section key={o.id} className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{seller?.store_name ?? "Seller"}</p>
                  <p className="text-xs text-muted-foreground">Order ID: {o.id.slice(0, 8)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={o.status} />
                  <span className="font-display text-sm font-semibold">{formatKobo(o.total_kobo)}</span>
                </div>
              </div>
              <ul className="divide-y divide-border px-4 text-sm">
                {items.map((it) => (
                  <li key={it.id} className="flex justify-between py-2.5">
                    <span>{it.product_name} × {it.quantity}</span>
                    <span>{formatKobo(it.line_total_kobo)}</span>
                  </li>
                ))}
              </ul>

              {dispute && (
                <div className="border-t border-border bg-amber-50/60 px-4 py-3 text-xs">
                  <p className="font-medium">Dispute ({dispute.status.replace(/_/g, " ")}) — {dispute.reason.replace(/_/g, " ")}</p>
                  {dispute.resolution_note && <p className="mt-1 text-muted-foreground">Resolution: {dispute.resolution_note}</p>}
                </div>
              )}

              {review && (
                <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                  Reviewed: {review.rating}/5 stars
                </div>
              )}

              {checkout.status === "paid" && (
                <CustomerOrderControls
                  orderId={o.id}
                  sellerId={o.seller_id}
                  status={o.status as OrderStatus}
                  disputeId={dispute?.id}
                  hasReview={!!review}
                />
              )}

              {history.length > 0 && (
                <details className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Status timeline ({history.length})</summary>
                  <ul className="mt-2 space-y-1 pb-2">
                    {history.map((h, idx) => (
                      <li key={idx}>
                        <span className="font-medium capitalize text-foreground">{h.to_status.replace(/_/g, " ")}</span>
                        {" · "}
                        {new Date(h.created_at).toLocaleString("en-NG")}
                        {h.note ? ` — ${h.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
