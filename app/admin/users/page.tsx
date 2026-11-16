import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { setUserSuspendedAction } from "@/lib/admin/actions";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const me = await requireRole(["admin"], "/admin/users");
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: users, error }, { data: roleRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, full_name, is_suspended, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("user_roles").select("user_id, role"),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows ?? []) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">Users</h1>
        <span className="text-xs text-muted-foreground">{users?.length ?? 0} total</span>
      </div>
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">Could not load users: {error.message}</p>}
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{sp.error}</p>}
      {sp.done && <p role="status" className="mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-success">User updated.</p>}

      {!users?.length ? (
        <p className="mt-6 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No users found.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
        {(users ?? []).map((u) => {
          const roles = rolesByUser.get(u.id) ?? [];
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
      )}
    </main>
  );
}
