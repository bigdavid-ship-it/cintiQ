import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { setUserSuspendedAction } from "@/lib/admin/actions";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const me = await requireRole(["admin"], "/admin/users");
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_suspended, created_at, user_roles(role)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Users</h1>
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{sp.error}</p>}
      {sp.done && <p role="status" className="mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-success">User updated.</p>}

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
        {(users ?? []).map((u) => {
          const roles = ((u.user_roles ?? []) as unknown as { role: string }[]).map((r) => r.role);
          const isSelf = u.id === me.id;
          return (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-medium">{u.full_name || u.email}</p>
                <p className="text-xs text-muted-foreground">
                  {u.email} · {roles.join(", ")} · Joined {new Date(u.created_at).toLocaleDateString("en-NG")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={u.is_suspended ? "suspended" : "active"} />
                {!isSelf && (
                  <form action={setUserSuspendedAction.bind(null, u.id, !u.is_suspended)}>
                    <Button type="submit" variant={u.is_suspended ? "outline" : "danger"} className="h-9">
                      {u.is_suspended ? "Reactivate" : "Suspend"}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
