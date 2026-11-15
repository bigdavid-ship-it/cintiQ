import Link from "next/link";
import { requireActiveSeller } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";
import { formatKobo } from "@/lib/utils";

export const metadata = { title: "Finance & performance" };

export default async function SellerFinancePage() {
  const seller = await requireActiveSeller("/seller/finance");
  const supabase = await createClient();

  const [{ data: orders }, { data: settlements }, { data: reviews }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, total_kobo, created_at, commissions(percent, gross_kobo, commission_kobo, delivery_fee_kobo, seller_proceeds_kobo)")
      .eq("seller_id", seller.id)
      .not("paid_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("seller_settlements")
      .select("*")
      .eq("seller_id", seller.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("reviews").select("rating").eq("seller_id", seller.id),
  ]);

  const rows = orders ?? [];
  const completed = rows.filter((o) => o.status === "completed");
  const disputed = rows.filter((o) => o.status === "disputed");
  let grossTotal = 0;
  let commTotal = 0;
  let netTotal = 0;

  for (const o of completed) {
    const c = (o.commissions as unknown as { gross_kobo: number; commission_kobo: number; seller_proceeds_kobo: number }[] | null)?.[0];
    if (c) {
      grossTotal += c.gross_kobo;
      commTotal += c.commission_kobo;
      netTotal += c.seller_proceeds_kobo;
    }
  }

  const avgRating =
    reviews && reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : "—";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/seller" className="text-sm text-brand hover:underline">← Back to seller dashboard</Link>
      <h1 className="font-display mt-2 text-2xl font-semibold">Finance &amp; performance</h1>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Completed sales (gross)</dt>
          <dd className="font-display mt-1 text-xl font-semibold">{formatKobo(grossTotal)}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Platform commissions</dt>
          <dd className="font-display mt-1 text-xl font-semibold">{formatKobo(commTotal)}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Net seller proceeds</dt>
          <dd className="font-display mt-1 text-xl font-semibold text-brand">{formatKobo(netTotal)}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Rating / Disputes</dt>
          <dd className="font-display mt-1 text-xl font-semibold">
            {avgRating} ({reviews?.length ?? 0}) · {disputed.length} disputed
          </dd>
        </div>
      </dl>

      <h2 className="font-display mt-10 text-lg font-semibold">Transaction statement</h2>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No paid orders yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Status</th>
                <th className="p-3">Gross</th>
                <th className="p-3">Commission</th>
                <th className="p-3">Net proceeds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((o) => {
                const c = (o.commissions as unknown as { percent: number; gross_kobo: number; commission_kobo: number; seller_proceeds_kobo: number }[] | null)?.[0];
                return (
                  <tr key={o.id}>
                    <td className="p-3">
                      <Link href={`/seller/orders/${o.id}`} className="font-mono text-xs text-brand underline">
                        #{o.id.slice(0, 8)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-NG")}</div>
                    </td>
                    <td className="p-3"><StatusBadge status={o.status} /></td>
                    <td className="p-3">{c ? formatKobo(c.gross_kobo) : formatKobo(o.total_kobo)}</td>
                    <td className="p-3">{c ? `${formatKobo(c.commission_kobo)} (${c.percent}%)` : "—"}</td>
                    <td className="p-3 font-medium">{c ? formatKobo(c.seller_proceeds_kobo) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="font-display mt-10 text-lg font-semibold">Settlement history</h2>
      {!settlements?.length ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No settlements initiated yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card text-sm">
          {settlements.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Order #{s.order_id.slice(0, 8)} · {formatKobo(s.amount_kobo)}</p>
                <p className="text-xs text-muted-foreground">
                  Provider: {s.provider} {s.provider_reference ? `· Ref ${s.provider_reference}` : ""}
                  {s.failure_reason ? ` · ${s.failure_reason}` : ""}
                </p>
              </div>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
