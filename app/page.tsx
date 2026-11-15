import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, Search, ShieldCheck, ShoppingBag, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { ProductCard } from "@/components/shop/product-card";
import { CategoryMarquee } from "@/components/shop/category-marquee";
import { shuffleArray } from "@/lib/shuffle";
import type { Category, ProductRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const user = configured ? await getSessionUser() : null;

  let categories: Pick<Category, "id" | "name" | "slug">[] = [];
  let featured: ProductRow[] = [];
  let recent: ProductRow[] = [];

  if (configured) {
    const supabase = await createClient();
    const productSelect = "*, product_images(storage_path,sort_order), seller_profiles(store_name,slug), categories(name,slug)";

    const [{ data: catData }, { data: featData }, { data: recData }] = await Promise.all([
      supabase.from("categories").select("id,name,slug").eq("is_active", true).order("sort_order"),
      supabase.from("products").select(productSelect).eq("status", "active").eq("is_featured", true).limit(24),
      supabase.from("products").select(productSelect).eq("status", "active").limit(24),
    ]);

    categories = (catData ?? []) as Pick<Category, "id" | "name" | "slug">[];
    featured = shuffleArray((featData ?? []) as ProductRow[]).slice(0, 8);
    recent = shuffleArray((recData ?? []) as ProductRow[]).slice(0, 8);
  }

  return (
    <main>
      {/* Marketplace Search Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
          {!configured && (
            <p role="alert" className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Service not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
            </p>
          )}
          <div className="max-w-2xl space-y-2">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
              <MapPin className="size-3.5" aria-hidden />
              Campus Commerce Network
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Your Campus. Your Marketplace.
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Shop food, fashion, electronics, hostel essentials, and services from verified student entrepreneurs and businesses around campus.{" "}
              <Link href="/how-it-works" className="font-medium text-brand hover:underline">
                How it works →
              </Link>
            </p>
          </div>

          {/* Prominent Search Bar */}
          <form action="/explore" className="mt-6 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <label htmlFor="home-search" className="sr-only">Search products</label>
              <input
                id="home-search"
                name="q"
                type="search"
                placeholder="Search laptops, meals, textbooks, skincare, services..."
                className="h-12 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm focus:bg-card"
              />
            </div>
            <Button type="submit" className="h-12 px-6">Search marketplace</Button>
          </form>

          {/* Category Chips (auto-sliding marquee, pauses on hover/touch/focus) */}
          <CategoryMarquee categories={categories} />
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-8 sm:py-10">
        {/* New to cintiQ: Two-Sector Walkthrough (Buyers vs Sellers) */}
        <section aria-labelledby="paths-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="paths-heading" className="font-display text-xl font-semibold">New to cintiQ? Choose your path</h2>
              <p className="text-xs text-muted-foreground">A quick walkthrough for shoppers and campus sellers.</p>
            </div>
            <Link href="/how-it-works" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              Full walkthrough <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-6">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">
                  <ShoppingBag className="size-3.5" aria-hidden /> For Buyers
                </span>
                <h3 className="font-display text-lg font-semibold">Shop from verified campus sellers</h3>
                <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground sm:text-sm">
                  <li>Browse products or verified storefronts across campus.</li>
                  <li>Pay safely with Paystack for hostel delivery or collection.</li>
                  <li>Inspect your order and share your 6-digit OTP at handover.</li>
                </ol>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/explore">Start shopping</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/how-it-works#buyers-sector">Buyer guide</Link>
                </Button>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-6">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">
                  <Store className="size-3.5" aria-hidden /> For Sellers
                </span>
                <h3 className="font-display text-lg font-semibold">Launch your verified campus store</h3>
                <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground sm:text-sm">
                  <li>Apply with your student ID or business details &amp; bank account.</li>
                  <li>List products and share your unique store link anywhere.</li>
                  <li>Verify the buyer&apos;s handover OTP and get settled to your bank.</li>
                </ol>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/become-a-seller">Apply to sell</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/how-it-works#sellers-sector">Seller guide</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Verified Sellers Directory CTA */}
        <section
          aria-labelledby="sellers-heading"
          className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Store className="size-5" aria-hidden />
            </div>
            <div>
              <h2 id="sellers-heading" className="font-display text-lg font-semibold">
                Explore verified campus sellers
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Browse all approved student entrepreneurs and campus businesses in one place.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/sellers">
              Check out verified sellers <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </section>

        {/* Trending / Featured Products */}
        {featured.length > 0 && (
          <section aria-labelledby="trending-heading">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="trending-heading" className="font-display text-xl font-semibold">Trending on campus</h2>
              <Link href="/explore" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                View all <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {featured.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        {/* Recently Added Products */}
        <section aria-labelledby="recent-heading">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="recent-heading" className="font-display text-xl font-semibold">Recently added</h2>
            <Link href="/explore?sort=newest" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              Explore all <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <p className="font-medium">No products listed yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Verified campus sellers will appear here as soon as they publish inventory.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/become-a-seller">Apply to sell first</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {recent.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </section>

        {/* Trust & Buyer Protection Pillars */}
        <section className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-3">
          <div className="space-y-1.5">
            <ShieldCheck className="size-5 text-brand" aria-hidden />
            <h3 className="font-display text-sm font-semibold">OTP delivery protection</h3>
            <p className="text-xs text-muted-foreground">
              Confirm receipt with a one-time 6-digit code at handover, or report an issue before order completion.
            </p>
          </div>
          <div className="space-y-1.5">
            <CheckCircle2 className="size-5 text-brand" aria-hidden />
            <h3 className="font-display text-sm font-semibold">Verified campus sellers</h3>
            <p className="text-xs text-muted-foreground">
              Every student entrepreneur and local business is reviewed with ID and location checks before listing.
            </p>
          </div>
          <div className="space-y-1.5">
            <Truck className="size-5 text-brand" aria-hidden />
            <h3 className="font-display text-sm font-semibold">Direct campus fulfilment</h3>
            <p className="text-xs text-muted-foreground">
              Choose doorstep hostel/faculty delivery or convenient in-person collection around your university.
            </p>
          </div>
        </section>

        {/* Become a Seller Banner */}
        {!user?.roles.includes("seller") && (
          <section className="flex flex-col justify-between gap-6 rounded-xl bg-brand p-8 text-white sm:flex-row sm:items-center">
            <div className="max-w-xl space-y-2">
              <h2 className="font-display text-2xl font-semibold">Sell to students on your campus</h2>
              <p className="text-sm text-white/85">
                Open a verified storefront, manage inventory, accept Paystack payments, and track commissions transparently.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0 border-white bg-white text-brand hover:bg-white/90">
              <Link href="/become-a-seller">Start selling</Link>
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}
