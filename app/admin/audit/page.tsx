import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit log" };

export default async function AdminAuditPage() {
  await requireRole(["admin"], "/admin/audit");
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-muted-foreground">Append-only record of sensitive platform actions.</p>
      {!logs?.length ? (
        <p className="mt-8 text-sm text-muted-foreground">No audit entries yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card text-xs">
          {logs.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <span className="font-mono font-semibold text-foreground">{l.action}</span>
                {" · "}
                <span className="text-muted-foreground">{l.entity_type} {l.entity_id ? `(${l.entity_id.slice(0, 12)})` : ""}</span>
              </div>
              <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("en-NG")}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
