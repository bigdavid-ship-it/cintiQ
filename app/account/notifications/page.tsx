import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/notifications/actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/account/notifications");
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const unread = (items ?? []).filter((n) => !n.read_at).length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/account" className="text-sm text-brand hover:underline">← Back to account</Link>
          <h1 className="font-display mt-1 text-2xl font-semibold">Notifications</h1>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" className="h-9">Mark all read ({unread})</Button>
          </form>
        )}
      </div>

      {!items?.length ? (
        <p className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          You have no notifications yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((n) => (
            <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 p-4 text-sm ${!n.read_at ? "bg-brand-soft/30" : ""}`}>
              <div className="space-y-1">
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                <p className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString("en-NG")}</p>
                {n.link && (
                  <Link href={n.link} className="inline-block text-xs font-medium text-brand underline">
                    View details
                  </Link>
                )}
              </div>
              {!n.read_at && (
                <form action={markNotificationReadAction.bind(null, n.id)}>
                  <Button type="submit" variant="ghost" className="h-8 text-xs">Mark read</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
