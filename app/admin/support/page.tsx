import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Support inbox" };

const FILTERS = [
  ["open", "Open"],
  ["unread", "Unread"],
  ["resolved", "Resolved"],
  ["all", "All"],
] as const;

type Row = {
  id: string;
  status: string;
  last_message_at: string;
  last_message_preview: string;
  admin_unread: number;
  profiles: { full_name: string | null; email: string | null } | null;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

function when(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export default async function AdminSupportInboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireRole(["admin"], "/admin/support");
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.filter) ? (sp.filter as string) : "open";

  const supabase = await createClient();
  let query = supabase
    .from("support_conversations")
    .select("id, status, last_message_at, last_message_preview, admin_unread, profiles(full_name, email)")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (filter === "open") query = query.eq("status", "open");
  else if (filter === "resolved") query = query.eq("status", "resolved");
  else if (filter === "unread") query = query.gt("admin_unread", 0);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Support inbox</h1>
          <p className="text-sm text-muted-foreground">Every user conversation in one place. Only admins can reply.</p>
        </div>
      </div>

      <div className="mt-5 flex gap-1.5 overflow-x-auto">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "open" ? "/admin/support" : `/admin/support?filter=${key}`}
            className={cn(
              "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
              filter === key ? "border-brand bg-brand text-white" : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No conversations here yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((c) => {
            const name = c.profiles?.full_name?.trim() || c.profiles?.email || "Unknown user";
            const unread = c.admin_unread > 0;
            return (
              <li key={c.id}>
                <Link href={`/admin/support/${c.id}`} className="flex items-center gap-3 p-3.5 transition hover:bg-muted/50">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                    {initials(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{name}</span>
                      <span suppressHydrationWarning className="shrink-0 text-[11px] text-muted-foreground">
                        {when(c.last_message_at)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={cn("truncate text-xs", unread ? "text-foreground" : "text-muted-foreground")}>
                        {c.last_message_preview || "No messages yet"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {c.status === "resolved" && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Resolved</span>
                        )}
                        {unread && (
                          <span className="flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {c.admin_unread > 99 ? "99+" : c.admin_unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Looking for older email-form messages?{" "}
        <Link href="/admin/reports" className="font-medium text-brand hover:underline">
          View legacy tickets
        </Link>
      </p>
    </main>
  );
}
