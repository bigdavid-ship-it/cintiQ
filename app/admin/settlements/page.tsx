import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import { getPaystackBalance } from "@/lib/payments/paystack";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { formatKobo } from "@/lib/utils";
import { initiateSettlementAction, markManualSettlementAction, processRefundAction } from "@/lib/admin/actions";

export const metadata = { title: "Settlements & refunds" };

function pickProceeds(raw: unknown): number | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return (item as { seller_proceeds_kobo?: number } | null)?.seller_proceeds_kobo ?? null;
}

export default async function AdminSettlementsPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  await requireRole(["admin"], "/admin/settlements");
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: modeRow }, { data: completedOrders }, { data: settlements }, { data: refundOrders }] = await Promise.all([
    supabase.from("platform_settings").select("value").eq("key", "settlement_mode").maybeSingle(),
    supabase
      .from("orders")
      .select("id, seller_id, total_kobo, completed_at, seller_profiles(store_name), commissions(seller_proceeds_kobo), seller_settlements(id, status)")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(50),
    supabase
      .from("seller_settlements")
      .select("*, seller_profiles(store_name)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("orders")
      .select("id, total_kobo, updated_at, checkouts(reference), seller_profiles(store_name)")
      .eq("status", "refund_pending")
      .order("updated_at", { ascending: true })
      .limit(50),
  ]);

  const mode = String(modeRow?.value ?? "unconfigured").replace(/"/g, "");
  const paystackReady = isConfigured("PAYSTACK_SECRET_KEY");
  const balances = paystackReady ? await getPaystackBalance().catch(() => null) : null;
  const ngnBalanceKobo = balances?.find((b) => b.currency === "NGN")?.balance ?? null;

  const readyToSettle = (completedOrders ?? []).filter((o) => {
    const raw = o.seller_settlements;
    const s = (Array.isArray(raw) ? raw[0] : raw) as { status?: string } | null;
    return !s || s.status === "pending_provider" || s.status === "failed";
  });

  const sellerIds = [...new Set(readyToSettle.map((o) => o.seller_id))];
  const { data: sellerBanks } = sellerIds.length
    ? await supabase
        .from("seller_bank_accounts")
        .select("user_id, bank_name, account_number, account_name, is_verified")
        .in("user_id", sellerIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const bankBySeller = new Map<string, { bank_name: string; account_number: string; account_name: string; is_verified: boolean }>();
  for (const b of sellerBanks ?? []) {
    if (!bankBySeller.has(b.user_id)) bankBySeller.set(b.user_id, b);
  }

  const totalEligibleKobo = readyToSettle.reduce((sum, o) => {
    return sum + (pickProceeds(o.commissions) ?? o.total_kobo);
  }, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Settlements &amp; refunds</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Current settlement mode: <strong className="text-foreground">{mode}</strong> · Paystack secret key:{" "}
        <strong className="text-foreground">{paystackReady ? "configured" : "not configured"}</strong>
      </p>

      {paystackReady && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Paystack Available Transfer Balance (NGN)
            </p>
            <p className="font-display mt-0.5 text-2xl font-semibold">
              {ngnBalanceKobo !== null ? formatKobo(ngnBalanceKobo) : "Unable to fetch"}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="text-muted-foreground">Total awaiting settlement: <strong className="text-foreground">{formatKobo(totalEligibleKobo)}</strong></p>
            {ngnBalanceKobo !== null && totalEligibleKobo > 0 && (
              <p className={`mt-1 font-medium ${ngnBalanceKobo >= totalEligibleKobo ? "text-success" : "text-danger"}`}>
                {ngnBalanceKobo >= totalEligibleKobo
                  ? "Balance covers all pending payouts"
                  : `Short by ${formatKobo(totalEligibleKobo - ngnBalanceKobo)} (top up Paystack or wait for T+1 clearing)`}
              </p>
            )}
          </div>
        </div>
      )}

      {mode === "unconfigured" && (
        <p role="alert" className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Settlement partner is not configured (`settlement_mode = unconfigured`). Settlements remain in{" "}
          <code>pending_provider</code> and are never simulated.
        </p>
      )}
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">{sp.error}</p>}
      {sp.done && <p role="status" className="mt-4 rounded-md bg-brand-soft px-4 py-3 text-sm text-success">{sp.done}</p>}

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Completed orders eligible for settlement</h2>
        {readyToSettle.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No completed orders awaiting settlement.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {readyToSettle.map((o) => {
              const seller = o.seller_profiles as unknown as { store_name: string } | null;
              const proceedsKobo = pickProceeds(o.commissions) ?? o.total_kobo;
              const covered = ngnBalanceKobo === null || ngnBalanceKobo >= proceedsKobo;
              const bank = bankBySeller.get(o.seller_id);
              return (
                <li key={o.id} className="space-y-3 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{seller?.store_name} · Order #{o.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        Proceeds: {formatKobo(proceedsKobo)}
                        {ngnBalanceKobo !== null && (
                          <span className={`ml-2 font-medium ${covered ? "text-success" : "text-danger"}`}>
                            · {covered ? "Covered by balance" : "Insufficient Paystack balance"}
                          </span>
                        )}
                      </p>
                      {bank && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Payout bank: <strong className="text-foreground">{bank.account_name}</strong> · {bank.bank_name} ({bank.account_number})
                          {bank.is_verified ? " · Verified" : ""}
                        </p>
                      )}
                    </div>
                    <form action={initiateSettlementAction.bind(null, o.id)}>
                      <Button type="submit" variant="outline">Initiate Paystack transfer</Button>
                    </form>
                  </div>
                  <form action={markManualSettlementAction.bind(null, o.id)} className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
                    <input
                      type="text"
                      name="transferRef"
                      required
                      minLength={3}
                      placeholder="Bank transfer reference (if paid manually)"
                      className="h-9 min-w-[240px] flex-1 rounded-md border border-border bg-background px-3 text-xs"
                    />
                    <Button type="submit" variant="ghost" className="h-9 text-xs">
                      Mark manually settled
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Pending buyer refunds</h2>
        {!refundOrders?.length ? (
          <p className="mt-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No orders awaiting refund.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {refundOrders.map((o) => {
              const seller = o.seller_profiles as unknown as { store_name: string } | null;
              const chk = o.checkouts as unknown as { reference: string } | null;
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <p className="font-medium">Order #{o.id.slice(0, 8)} · {formatKobo(o.total_kobo)}</p>
                    <p className="text-xs text-muted-foreground">
                      {seller?.store_name} · Ref {chk?.reference}
                    </p>
                  </div>
                  <form action={processRefundAction.bind(null, o.id)} className="flex items-center gap-2">
                    <input type="hidden" name="reason" value="Approved marketplace refund" />
                    <Button type="submit" variant="danger" disabled={!paystackReady}>
                      Issue Paystack refund
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Settlement records</h2>
        {!settlements?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">No settlement records yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card text-sm">
            {settlements.map((s) => {
              const seller = s.seller_profiles as unknown as { store_name: string } | null;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{seller?.store_name} · {formatKobo(s.amount_kobo)}</p>
                    <p className="text-xs text-muted-foreground">
                      Order #{s.order_id.slice(0, 8)} · {s.provider}
                      {s.provider_reference ? ` · ${s.provider_reference}` : ""}
                      {s.failure_reason ? ` · ${s.failure_reason}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
