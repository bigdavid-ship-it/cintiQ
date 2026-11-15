import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { updateSellerCommissionAction, updateSettingAction } from "@/lib/admin/actions";

export const metadata = { title: "Platform settings" };

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const admin = await requireRole(["admin"], "/admin/settings");
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: settings }, { data: sellers }] = await Promise.all([
    supabase.from("platform_settings").select("*").order("key"),
    supabase.from("seller_profiles").select("user_id, store_name, commission_percent").order("store_name"),
  ]);

  const isSuper = admin.roles.includes("super_admin");

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-10">
      <div>
        <h1 className="font-display text-2xl font-semibold">Platform settings &amp; commissions</h1>
        {sp.error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{sp.error}</p>}
        {sp.done && <p role="status" className="mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-success">Saved.</p>}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Marketplace policies</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {(settings ?? []).map((s) => {
            const rawVal = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
            const locked = s.key === "settlement_mode" && !isSuper;
            return (
              <li key={s.key} className="p-4">
                <form action={updateSettingAction.bind(null, s.key)} className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`set-${s.key}`} className="font-mono text-sm font-medium">{s.key}</label>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.key === "settlement_mode" ? (
                      <select
                        id={`set-${s.key}`}
                        name="value"
                        defaultValue={rawVal.replace(/"/g, "")}
                        disabled={locked}
                        className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                      >
                        <option value="unconfigured">unconfigured</option>
                        <option value="paystack_split_manual">paystack_split_manual</option>
                        <option value="paystack_transfer">paystack_transfer</option>
                      </select>
                    ) : (
                      <input
                        id={`set-${s.key}`}
                        name="value"
                        defaultValue={rawVal}
                        className="h-9 w-28 rounded-md border border-border px-2 text-sm"
                      />
                    )}
                    <Button type="submit" variant="outline" className="h-9" disabled={locked}>
                      {locked ? "Super admin only" : "Save"}
                    </Button>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Per-seller commission overrides</h2>
        <p className="text-xs text-muted-foreground">Leave blank to use the platform default commission rate.</p>
        {!sellers?.length ? (
          <p className="text-sm text-muted-foreground">No approved sellers yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {sellers.map((s) => (
              <li key={s.user_id} className="p-4">
                <form action={updateSellerCommissionAction.bind(null, s.user_id)} className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium">{s.store_name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      name="commissionPercent"
                      type="number"
                      step="0.5"
                      min={0}
                      max={50}
                      placeholder="Default"
                      defaultValue={s.commission_percent ?? ""}
                      className="h-9 w-24 rounded-md border border-border px-2 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <Button type="submit" variant="outline" className="h-9">Update</Button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
