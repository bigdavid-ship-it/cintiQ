import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatKobo } from "@/lib/utils";

export const metadata = { title: "Admin analytics" };

const RANGES = { "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" } as const;
type Range = keyof typeof RANGES;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireRole(["admin"], "/admin");
  const { range } = await searchParams;
  const active: Range = range && range in RANGES ? (range as Range) : "30d";
  const since =
    active === "7d"
      ? new Date(Date.now() - 7 * 86400_000).toISOString()
      : active === "30d"
        ? new Date(Date.now() - 30 * 86400_000).toISOString()
        : null;

  const supabase = await createClient();

  let ordersQ = supabase.from("orders").select("id, status, total_kobo, paid_at").not("paid_at", "is", null);
  let commQ = supabase.from("commissions").select("gross_kobo, commission_kobo, orders!inner(status, paid_at)").not("orders.paid_at", "is", null);
  if (since) {
    ordersQ = ordersQ.gte("created_at", since);
    commQ = commQ.gte("created_at", since);
  }

  const [
    { count: customers },
    { count: sellers },
    { count: pendingApps },
    { count: activeProducts },
    { count: openDisputes },
    { data: orders },
    { data: comms },
    { data: pendingSettlements },
  ] = await Promise.all([
    supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    supabase.from("seller_profiles").select("user_id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("seller_applications").select("id", { count: "exact", head: true }).in("status", ["pending", "under_review"]),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "under_investigation"]),
    ordersQ,
    commQ,
    supabase
      .from("orders")
      .select("id, total_kobo, commissions(seller_proceeds_kobo), seller_settlements(status)")
      .eq("status", "completed"),
  ]);

  const orderList = orders ?? [];
  const totalOrders = orderList.length;
  const completedOrders = orderList.filter((o) => o.status === "completed").length;
  const cancelledOrders = orderList.filter((o) => o.status === "cancelled" || o.status === "rejected" || o.status === "refunded").length;
  const disputedOrders = orderList.filter((o) => o.status === "disputed").length;

  const gmvKobo = orderList.reduce((s, o) => s + o.total_kobo, 0);
  const commissionKobo = (comms ?? []).reduce((s, c) => {
    const ord = Array.isArray(c.orders) ? c.orders[0] : c.orders;
    const st = (ord as { status?: string } | null)?.status;
    return st === "completed" ? s + c.commission_kobo : s;
  }, 0);
  const pendingSettlementKobo = (pendingSettlements ?? []).reduce((sum, o) => {
    const sRaw = Array.isArray(o.seller_settlements) ? o.seller_settlements[0] : o.seller_settlements;
    const status = (sRaw as { status?: string } | null)?.status;
    if (status === "settled") return sum;
    const cRaw = Array.isArray(o.commissions) ? o.commissions[0] : o.commissions;
    const proceeds = (cRaw as { seller_proceeds_kobo?: number } | null)?.seller_proceeds_kobo;
    return sum + (proceeds ?? o.total_kobo);
  }, 0);

  const stats = [
    ["Registered customers", String(customers ?? 0), "/admin/users"],
    ["Approved sellers", String(sellers ?? 0), "/admin/sellers?status=approved"],
    ["Pending applications", String(pendingApps ?? 0), "/admin/sellers?status=pending"],
    ["Active products", String(activeProducts ?? 0), "/admin/products"],
    ["Total paid orders", String(totalOrders), "/admin/transactions"],
    ["Completed orders", String(completedOrders), "/admin/transactions"],
    ["Cancelled / refunded", String(cancelledOrders), "/admin/transactions"],
    ["Open disputes", String(openDisputes ?? disputedOrders), "/admin/disputes"],
    ["Gross merchandise value", formatKobo(gmvKobo), "/admin/transactions"],
    ["Platform commission (completed)", formatKobo(commissionKobo), "/admin/settlements"],
    ["Pending seller settlements", formatKobo(pendingSettlementKobo), "/admin/settlements"],
  ] as const;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Platform overview</h1>
          <p className="text-xs text-muted-foreground">Signed in as {user.email} · Live database metrics</p>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Date range">
          {Object.entries(RANGES).map(([k, label]) => (
            <Link
              key={k}
              href={`/admin?range=${k}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${active === k ? "border-brand bg-brand text-white" : "border-border bg-card"}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, val, href]) => (
          <Link key={label} href={href} className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-display mt-1 text-2xl font-semibold">{val}</dd>
          </Link>
        ))}
      </dl>

      {totalOrders === 0 && (
        <p className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No paid orders recorded in this period. Metrics will populate automatically as real transactions occur.
        </p>
      )}
    </main>
  );
}
