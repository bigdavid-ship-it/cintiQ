import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { resolveDisputeAction } from "@/lib/orders/actions";
import { formatKobo } from "@/lib/utils";

export const metadata = { title: "Inspect dispute" };

export default async function AdminDisputeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireRole(["admin"], `/admin/disputes/${id}`);
  const supabase = await createClient();

  const { data: dispute } = await supabase
    .from("disputes")
    .select("*, orders(id, total_kobo, status, fulfilment_method, delivered_at, delivery_evidence_path, order_items(product_name, quantity, line_total_kobo)), seller_profiles(store_name)")
    .eq("id", id)
    .maybeSingle();

  if (!dispute) notFound();

  const { data: evidence } = await supabase
    .from("dispute_evidence")
    .select("*")
    .eq("dispute_id", id)
    .order("created_at");

  const signedEvidence = await Promise.all(
    (evidence ?? []).map(async (e) => ({
      ...e,
      url: (await supabase.storage.from("order-evidence").createSignedUrl(e.storage_path, 300)).data?.signedUrl,
    })),
  );

  const order = dispute.orders as unknown as {
    id: string;
    total_kobo: number;
    status: string;
    fulfilment_method: string;
    delivered_at: string | null;
    delivery_evidence_path: string | null;
    order_items: { product_name: string; quantity: number; line_total_kobo: number }[];
  };
  const seller = dispute.seller_profiles as unknown as { store_name: string } | null;
  const open = dispute.status === "open" || dispute.status === "under_investigation";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/admin/disputes" className="text-sm text-brand hover:underline">← Back to disputes</Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold capitalize">{dispute.reason.replace(/_/g, " ")}</h1>
          <p className="text-sm text-muted-foreground">Order #{order.id.slice(0, 8)} · {seller?.store_name} · {formatKobo(order.total_kobo)}</p>
        </div>
        <StatusBadge status={dispute.status} />
      </div>

      {sp.error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{sp.error}</p>}
      {sp.done && <p role="status" className="mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-success">Dispute updated: {sp.done.replace(/_/g, " ")}.</p>}

      <section className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
        <h2 className="font-display mb-2 text-base font-semibold">Customer complaint</h2>
        <p className="whitespace-pre-wrap">{dispute.description}</p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
        <h2 className="font-display mb-2 text-base font-semibold">Order items</h2>
        <ul className="divide-y divide-border">
          {order.order_items.map((it, i) => (
            <li key={i} className="flex justify-between py-2">
              <span>{it.product_name} × {it.quantity}</span>
              <span>{formatKobo(it.line_total_kobo)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
        <h2 className="font-display mb-2 text-base font-semibold">Submitted evidence</h2>
        {signedEvidence.length === 0 ? (
          <p className="text-muted-foreground">No evidence files uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {signedEvidence.map((ev) => (
              <li key={ev.id}>
                {ev.url ? (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                    {ev.original_name}
                  </a>
                ) : (
                  ev.original_name
                )}
                {ev.note && <span className="text-muted-foreground"> — {ev.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {dispute.resolution_note && (
        <section className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="font-semibold">Resolution note</p>
          <p className="mt-1">{dispute.resolution_note}</p>
        </section>
      )}

      {open && (
        <section className="mt-8 space-y-4 border-t border-border pt-6">
          {dispute.status === "open" && (
            <form action={resolveDisputeAction.bind(null, id, "under_investigation")}>
              <Button type="submit" variant="outline">Mark under investigation</Button>
            </form>
          )}
          <form action={resolveDisputeAction.bind(null, id, "resolved_refund")} className="space-y-2 rounded-lg border border-border bg-card p-4">
            <label htmlFor="refund-note" className="text-sm font-medium">Resolution note (for buyer refund)</label>
            <textarea id="refund-note" name="note" required minLength={5} className="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm" />
            <Button type="submit" variant="danger">Approve refund to buyer</Button>
          </form>
          <form action={resolveDisputeAction.bind(null, id, "resolved_release")} className="space-y-2 rounded-lg border border-border bg-card p-4">
            <label htmlFor="release-note" className="text-sm font-medium">Resolution note (for seller release)</label>
            <textarea id="release-note" name="note" required minLength={5} className="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm" />
            <Button type="submit">Resolve in seller&apos;s favour (complete order)</Button>
          </form>
        </section>
      )}
    </main>
  );
}
