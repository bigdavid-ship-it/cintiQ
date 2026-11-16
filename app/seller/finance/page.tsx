import Link from "next/link";
import { CheckCircle2, Landmark, Phone } from "lucide-react";
import { requireActiveSeller } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import { listNigerianBanks, type PaystackBank } from "@/lib/payments/paystack";
import { BankAccountForm } from "@/components/seller/bank-account-form";
import { PhoneNumberForm } from "@/components/seller/phone-form";
import { StatusBadge } from "@/components/ui/form-parts";
import { formatKobo } from "@/lib/utils";

type CommissionInfo = { seller_proceeds_kobo: number };
function pickCommission(raw: unknown): CommissionInfo | null {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as CommissionInfo | null;
}

export const metadata = { title: "Finance & performance" };

export default async function SellerFinancePage() {
  const seller = await requireActiveSeller("/seller/finance");
  const supabase = await createClient();

  const [{ data: orders }, { data: settlements }, { data: reviews }, { data: bankAccount }, { data: sellerProfile }, banks] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, total_kobo, created_at, commissions(seller_proceeds_kobo)")
      .eq("seller_id", seller.id)
      .not("paid_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("seller_settlements")
      .select("*")
      .eq("seller_id", seller.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("reviews").select("rating").eq("seller_id", seller.id),
    supabase
      .from("seller_bank_accounts")
      .select("bank_name, bank_code, account_number, account_name, is_verified")
      .eq("user_id", seller.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("seller_profiles").select("phone").eq("user_id", seller.id).maybeSingle(),
    isConfigured("PAYSTACK_SECRET_KEY") ? listNigerianBanks().catch((): PaystackBank[] => []) : Promise.resolve([] as PaystackBank[]),
  ]);

  const rows = orders ?? [];
  const completed = rows.filter((o) => o.status === "completed");
  const disputed = rows.filter((o) => o.status === "disputed");
  let netTotal = 0;

  for (const o of completed) {
    const c = pickCommission(o.commissions);
    netTotal += c ? c.seller_proceeds_kobo : o.total_kobo;
  }

  const avgRating =
    reviews && reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : "—";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/seller" className="text-sm text-brand hover:underline">← Back to seller dashboard</Link>
      <h1 className="font-display mt-2 text-2xl font-semibold">Finance &amp; performance</h1>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Completed orders</dt>
          <dd className="font-display mt-1 text-xl font-semibold">{completed.length}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Completed earnings</dt>
          <dd className="font-display mt-1 text-xl font-semibold text-brand">{formatKobo(netTotal)}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Rating / Disputes</dt>
          <dd className="font-display mt-1 text-xl font-semibold">
            {avgRating} ({reviews?.length ?? 0}) · {disputed.length} disputed
          </dd>
        </div>
      </dl>

      <section aria-labelledby="store-phone-heading" className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Phone className="size-5" aria-hidden />
          </div>
          <div>
            <h2 id="store-phone-heading" className="font-display text-lg font-semibold">Store phone number</h2>
            <p className="text-xs text-muted-foreground">
              Used for automated new-order voice call alerts and admin contact.
            </p>
          </div>
        </div>
        <PhoneNumberForm currentPhone={sellerProfile?.phone ?? ""} />
      </section>

      <section aria-labelledby="payout-bank-heading" className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Landmark className="size-5" aria-hidden />
            </div>
            <div>
              <h2 id="payout-bank-heading" className="font-display text-lg font-semibold">Payout bank account</h2>
              <p className="text-xs text-muted-foreground">
                Your settlement payouts are sent here. Changing your account automatically verifies the account name with Paystack.
              </p>
            </div>
          </div>
          {bankAccount?.is_verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
              <CheckCircle2 className="size-3.5" aria-hidden /> Paystack verified
            </span>
          )}
        </div>

        {bankAccount && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">{bankAccount.account_name}</p>
            <p className="text-xs text-muted-foreground">
              {bankAccount.bank_name} · <span className="font-mono">{bankAccount.account_number}</span>
            </p>
          </div>
        )}

        <BankAccountForm banks={banks} current={bankAccount} />
      </section>

      <h2 className="font-display mt-10 text-lg font-semibold">Transaction statement</h2>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No paid orders yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Status</th>
                <th className="p-3">Your earnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((o) => {
                const c = pickCommission(o.commissions);
                const earningsKobo = c ? c.seller_proceeds_kobo : o.total_kobo;
                return (
                  <tr key={o.id}>
                    <td className="p-3">
                      <Link href={`/seller/orders/${o.id}`} className="font-mono text-xs text-brand underline">
                        #{o.id.slice(0, 8)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-NG")}</div>
                    </td>
                    <td className="p-3"><StatusBadge status={o.status} /></td>
                    <td className="p-3 font-medium">{formatKobo(earningsKobo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="font-display mt-10 text-lg font-semibold">Settlement history</h2>
      {!settlements?.length ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No settlements initiated yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card text-sm">
          {settlements.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Order #{s.order_id.slice(0, 8)} · {formatKobo(s.amount_kobo)}</p>
                <p className="text-xs text-muted-foreground">
                  Provider: {s.provider} {s.provider_reference ? `· Ref ${s.provider_reference}` : ""}
                  {s.failure_reason ? ` · ${s.failure_reason}` : ""}
                </p>
              </div>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
