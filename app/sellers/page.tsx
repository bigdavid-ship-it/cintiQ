import Link from "next/link";
import { ArrowRight, CheckCircle2, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { shuffleArray } from "@/lib/shuffle";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verified campus sellers" };

type SellerItem = {
  user_id: string;
  store_name: string;
  slug: string;
  location: string;
  seller_type: string;
  description: string | null;
};

export default async function VerifiedSellersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("seller_profiles")
    .select("user_id,store_name,slug,location,seller_type,description")
    .eq("status", "active");

  const sellers = shuffleArray((data ?? []) as SellerItem[]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Verified campus sellers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sellers.length} verified storefront{sellers.length === 1 ? "" : "s"} · shuffled fairly on every visit.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/become-a-seller">
            Become a seller <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>

      {sellers.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <p className="font-medium">No verified sellers yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Verified storefronts will appear here once seller applications are approved.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.map((s) => (
            <Link
              key={s.user_id}
              href={`/sellers/${s.slug}`}
              className="group flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-5 transition-shadow hover:border-brand/40 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Store className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold group-hover:text-brand">
                    {s.store_name}
                    <CheckCircle2 className="size-4 shrink-0 text-brand" aria-label="Verified" />
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {s.seller_type} · {s.location}
                  </p>
                </div>
              </div>
              {s.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
              )}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                Visit storefront <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
