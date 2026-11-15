import { notFound } from "next/navigation";
import Link from "next/link";
import { requireActiveSeller } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";
import { SellerOrderControls } from "@/components/orders/seller-order-controls";
import { formatKobo } from "@/lib/utils";
import type { FulfilmentMethod, OrderStatus } from "@/lib/orders/transitions";

export const metadata = { title: "Manage order" };

export default async function SellerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seller = await requireActiveSeller(`/seller/orders/${id}`);
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*), commissions(*), disputes(id, reason, description, status, resolution_note), order_status_history(to_status, note, created_at)")
    .eq("id", id)
    .eq("seller_id", seller.id)
    .not("paid_at", "is", null)
    .maybeSingle();

  if (!order) notFound();

  const items = (order.order_items ?? []) as unknown as { id: string; product_name: string; unit_price_kobo: number; quantity: number; line_total_kobo: number }[];
  const comm = (order.commissions as unknown as { percent: number; gross_kobo: number; commission_kobo: number; delivery_fee_kobo: number; seller_proceeds_kobo: number }[] | null)?.[0] ?? null;
  const dispute = (order.disputes as unknown as { id: string; reason: string; description: string; status: string; resolution_note: string | null }[] | null)?.[0] ?? null;
  const history = (order.order_status_history ?? []) as unknown as { to_status: string; note: string | null; created_at: string }[];

  let evidenceUrl: string | null = null;
  if (order.delivery_evidence_path) {
    evidenceUrl = (await supabase.storage.from("order-evidence").createSignedUrl(order.delivery_evidence_path, 300)).data?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/seller/orders" className="text-sm text-brand hover:underline">← Back to orders</Link>
          <h1 className="font-display mt-1 text-2xl font-semibold">Order #{order.id.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">Paid {new Date(order.paid_at).toLocaleString("en-NG")}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="font-display mb-2 text-base font-semibold">Customer &amp; delivery</h2>
          <p><strong>Method:</strong> {order.fulfilment_method}</p>
          <p><strong>Recipient:</strong> {order.recipient_name}</p>
          <p><strong>Phone:</strong> {order.recipient_phone}</p>
          <p><strong>Address:</strong> {order.delivery_address}</p>
          {order.notes && <p className="mt-2 text-muted-foreground">Note: {order.notes}</p>}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="font-display mb-2 text-base font-semibold">Earnings breakdown</h2>
          {comm ? (
            <dl className="space-y-1">
              <div className="flex justify-between"><dt className="text-muted-foreground">Items gross</dt><dd>{formatKobo(comm.gross_kobo)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Platform commission ({comm.percent}%)</dt><dd>-{formatKobo(comm.commission_kobo)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Delivery fee</dt><dd>{formatKobo(comm.delivery_fee_kobo)}</dd></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Your net proceeds</dt><dd>{formatKobo(comm.seller_proceeds_kobo)}</dd></div>
            </dl>
          ) : (
            <p className="text-muted-foreground">Total: {formatKobo(order.total_kobo)}</p>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">Items</div>
        <ul className="divide-y divide-border px-4 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex justify-between py-2.5">
              <span>{it.product_name} × {it.quantity}</span>
              <span>{formatKobo(it.line_total_kobo)}</span>
            </li>
          ))}
        </ul>
      </section>

      {evidenceUrl && (
        <p className="mt-4 text-sm">
          Delivery evidence: <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline">View uploaded file</a>
        </p>
      )}

      {dispute && (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold">Dispute ({dispute.status.replace(/_/g, " ")}) — {dispute.reason.replace(/_/g, " ")}</p>
          <p className="mt-1">{dispute.description}</p>
          {dispute.resolution_note && <p className="mt-2 font-medium">Resolution: {dispute.resolution_note}</p>}
        </section>
      )}

      <section className="mt-6">
        <SellerOrderControls
          orderId={order.id}
          status={order.status as OrderStatus}
          method={order.fulfilment_method as FulfilmentMethod}
          disputeId={dispute?.id}
        />
      </section>

      {history.length > 0 && (
        <section className="mt-8 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          <h2 className="font-display mb-2 text-sm font-semibold text-foreground">Timeline</h2>
          <ul className="space-y-1">
            {history.map((h, i) => (
              <li key={i}>
                <span className="font-medium capitalize text-foreground">{h.to_status.replace(/_/g, " ")}</span>
                {" · "}
                {new Date(h.created_at).toLocaleString("en-NG")}
                {h.note ? ` — ${h.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
