import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";

export const metadata = { title: "Disputes" };

const FILTERS = ["open", "under_investigation", "resolved_refund", "resolved_release"] as const;

export default async function AdminDisputesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["admin"], "/admin/disputes");
  const { status } = await searchParams;
  const active = FILTERS.find((f) => f === status) ?? "open";
  const supabase = await createClient();

  const { data: disputes } = await supabase
    .from("disputes")
    .select("id, order_id, reason, status, created_at, seller_profiles(store_name)")
    .eq("status", active)
    .order("created_at", { ascending: true })
    .limit(100);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Disputes</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/disputes?status=${f}`}
            className={`rounded-full border px-3 py-1 text-sm capitalize ${f === active ? "border-brand bg-brand text-white" : "border-border bg-card"}`}
          >
            {f.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {!disputes?.length ? (
        <p className="mt-10 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No {active.replace(/_/g, " ")} disputes.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {disputes.map((d) => {
            const seller = d.seller_profiles as unknown as { store_name: string } | null;
            return (
              <li key={d.id}>
                <Link href={`/admin/disputes/${d.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
                  <div>
                    <p className="text-sm font-medium capitalize">{d.reason.replace(/_/g, " ")} · Order #{d.order_id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">
                      {seller?.store_name ?? "Seller"} · {new Date(d.created_at).toLocaleString("en-NG")}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
