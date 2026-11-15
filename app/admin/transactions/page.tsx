import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";
import { formatKobo } from "@/lib/utils";

export const metadata = { title: "Transactions & orders" };

export default async function AdminTransactionsPage() {
  await requireRole(["admin"], "/admin/transactions");
  const supabase = await createClient();

  const [{ data: payments }, { data: orders }, { data: webhooks }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, reference, amount_kobo, status, channel, fees_kobo, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("orders")
      .select("id, status, total_kobo, fulfilment_method, created_at, seller_profiles(store_name), commissions(commission_kobo)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("payment_webhooks")
      .select("id, event_type, reference, signature_valid, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      <h1 className="font-display text-2xl font-semibold">Transactions &amp; orders</h1>

      <section>
        <h2 className="font-display mb-3 text-lg font-semibold">Payment records</h2>
        {!payments?.length ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Channel</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3 font-mono text-xs">{p.reference}</td>
                    <td className="p-3 font-medium">{formatKobo(p.amount_kobo)}</td>
                    <td className="p-3 text-muted-foreground">{p.channel ?? "—"}</td>
                    <td className="p-3"><StatusBadge status={p.status} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("en-NG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display mb-3 text-lg font-semibold">Recent orders</h2>
        {!orders?.length ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Seller</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Commission</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => {
                  const seller = o.seller_profiles as unknown as { store_name: string } | null;
                  const comm = (o.commissions as unknown as { commission_kobo: number }[] | null)?.[0];
                  return (
                    <tr key={o.id}>
                      <td className="p-3 font-mono text-xs">#{o.id.slice(0, 8)}</td>
                      <td className="p-3">{seller?.store_name ?? "—"}</td>
                      <td className="p-3 font-medium">{formatKobo(o.total_kobo)}</td>
                      <td className="p-3">{comm ? formatKobo(comm.commission_kobo) : "—"}</td>
                      <td className="p-3"><StatusBadge status={o.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display mb-3 text-lg font-semibold">Webhook logs</h2>
        {!webhooks?.length ? (
          <p className="text-sm text-muted-foreground">No webhooks received yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card text-xs">
            {webhooks.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <span className="font-mono font-medium">{w.event_type}</span> · {w.reference ?? "no ref"} · sig:{" "}
                  {w.signature_valid ? "valid" : "invalid"}
                  {w.error && <span className="text-danger"> · {w.error}</span>}
                </div>
                <StatusBadge status={w.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
