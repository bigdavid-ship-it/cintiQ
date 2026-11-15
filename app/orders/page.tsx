import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";
import { formatKobo } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Your orders" };

export default async function CustomerOrdersPage() {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/orders");
  const supabase = await createClient();
  const { data: checkouts } = await supabase
    .from("checkouts")
    .select("id, reference, status, total_kobo, fulfilment_method, created_at, orders(id, status, seller_profiles(store_name))")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Your orders</h1>
      {!checkouts?.length ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-medium">You have not placed any orders yet.</p>
          <Button asChild className="mt-4"><Link href="/shop">Browse products</Link></Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {checkouts.map((c) => {
            const subOrders = (c.orders ?? []) as unknown as { id: string; status: string; seller_profiles: { store_name: string } | null }[];
            return (
              <li key={c.id} className="rounded-lg border border-border bg-card p-4">
                <Link href={`/orders/${c.id}`} className="block">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-medium">{c.reference}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString("en-NG")} · {c.fulfilment_method} · {subOrders.length} seller order{subOrders.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={c.status} />
                      <span className="font-display text-base font-semibold">{formatKobo(c.total_kobo)}</span>
                    </div>
                  </div>
                  {subOrders.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                      {subOrders.map((o) => (
                        <span key={o.id} className="rounded bg-muted px-2 py-0.5">
                          {o.seller_profiles?.store_name ?? "Seller"}: {o.status.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
