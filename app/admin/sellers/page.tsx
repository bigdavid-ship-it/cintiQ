import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";

export const metadata = { title: "Seller applications" };
const FILTERS = ["pending", "under_review", "approved", "rejected"] as const;

export default async function AdminSellers({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["admin"], "/admin/sellers");
  const { status } = await searchParams;
  const active = FILTERS.find((f) => f === status) ?? "pending";
  const supabase = await createClient();
  const { data } = await supabase
    .from("seller_applications").select("id,business_name,seller_type,full_name,status,created_at")
    .eq("status", active).order("created_at", { ascending: true });
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Seller applications</h1>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/sellers?status=${f}`} className={`rounded-full border px-3 py-1 text-sm capitalize ${f === active ? "border-brand bg-brand text-white" : "border-border bg-card"}`}>
            {f.replace("_", " ")}
          </Link>
        ))}
      </div>
      {!data?.length ? (
        <p className="mt-10 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No {active.replace("_", " ")} applications.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {data.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/sellers/${a.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{a.business_name}</p>
                  <p className="text-xs text-muted-foreground">{a.full_name} · {a.seller_type} · {new Date(a.created_at).toLocaleDateString("en-NG")}</p>
                </div>
                <StatusBadge status={a.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
