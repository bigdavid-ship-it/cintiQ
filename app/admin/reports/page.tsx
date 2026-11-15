import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/form-parts";

export const metadata = { title: "Support & reports" };

export default async function AdminReportsPage() {
  await requireRole(["admin"], "/admin/reports");
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Support tickets</h1>
      {!tickets?.length ? (
        <p className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No support messages received yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {tickets.map((t) => (
            <li key={t.id} className="space-y-1 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{t.subject}</p>
                <StatusBadge status={t.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                From {t.name} ({t.email}) · {new Date(t.created_at).toLocaleString("en-NG")}
              </p>
              <p className="pt-1 whitespace-pre-wrap text-xs">{t.message}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
