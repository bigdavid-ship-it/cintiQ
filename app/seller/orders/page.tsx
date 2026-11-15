import Link from "next/link";
import { requireActiveSeller } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";
import { formatKobo } from "@/lib/utils";

export const metadata = { title: "Seller orders" };

export default async function SellerOrdersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const seller = await requireActiveSeller("/seller/orders");
  const { filter } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("id, status, total_kobo, fulfilment_method, recipient_name, created_at")
    .eq("seller_id", seller.id)
    .not("paid_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter === "active") {
    query = query.in("status", ["seller_notified", "accepted", "processing", "ready_for_delivery", "out_for_delivery", "delivered"]);
  } else if (filter === "disputed") {
    query = query.eq("status", "disputed");
  } else if (filter === "completed") {
    query = query.in("status", ["customer_confirmed", "completed"]);
  }

  const { data: orders } = await query;

  const tabs = [
    ["all", "All"],
    ["active", "Action required"],
    ["disputed", "Disputed"],
    ["completed", "Completed"],
  ] as const;
  const activeTab = tabs.some(([k]) => k === filter) ? filter! : "all";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Orders</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={k === "all" ? "/seller/orders" : `/seller/orders?filter=${k}`}
            className={`rounded-full border px-3 py-1 text-sm ${activeTab === k ? "border-brand bg-brand text-white" : "border-border bg-card"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {!orders?.length ? (
        <p className="mt-10 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No orders in this view yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/seller/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50">
                <div>
                  <p className="text-sm font-medium">Order #{o.id.slice(0, 8)} · {o.recipient_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.fulfilment_method} · {new Date(o.created_at).toLocaleString("en-NG")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={o.status} />
                  <span className="font-display text-sm font-semibold">{formatKobo(o.total_kobo)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
