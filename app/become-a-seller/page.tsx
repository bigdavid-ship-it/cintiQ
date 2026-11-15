import Link from "next/link";
import { CheckCircle2, ShieldCheck, Store, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Become a seller" };

export default async function BecomeASellerPage() {
  const user = await getSessionUser();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Sell on cintiQ</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Grow your campus business with verified trust
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Whether you are a student entrepreneur in a hostel or a physical trader around campus, cintiQ gives you a verified storefront, Paystack checkout, and transparent order management.
        </p>
        <div className="pt-2">
          {user ? (
            <Button asChild><Link href={user.roles.includes("seller") ? "/seller" : "/seller/apply"}>
              {user.roles.includes("seller") ? "Go to seller dashboard" : "Apply to sell now"}
            </Link></Button>
          ) : (
            <Button asChild><Link href="/register?next=/seller/apply">Create account &amp; apply</Link></Button>
          )}
        </div>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <Store className="size-5 text-brand" aria-hidden />
          <h2 className="font-display text-base font-semibold">Dedicated storefront</h2>
          <p className="text-sm text-muted-foreground">Manage your products, stock levels, and pricing from any phone or computer.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <ShieldCheck className="size-5 text-brand" aria-hidden />
          <h2 className="font-display text-base font-semibold">Verified badge</h2>
          <p className="text-sm text-muted-foreground">Every seller goes through identity and location verification so students buy with confidence.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <Wallet className="size-5 text-brand" aria-hidden />
          <h2 className="font-display text-base font-semibold">Transparent commissions</h2>
          <p className="text-sm text-muted-foreground">No listing fees. You only pay a platform commission on completed orders.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <CheckCircle2 className="size-5 text-brand" aria-hidden />
          <h2 className="font-display text-base font-semibold">OTP handover proof</h2>
          <p className="text-sm text-muted-foreground">Customers confirm receipt with a 6-digit code at delivery or collection.</p>
        </div>
      </div>
    </main>
  );
}
