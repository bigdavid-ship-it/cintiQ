import Link from "next/link";
import { ArrowRight, CheckCircle2, CreditCard, PackageCheck, Search, ShieldCheck, ShoppingBag, Store, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "How cintiQ works" };

const BUYER_STEPS = [
  {
    step: "01",
    icon: Search,
    title: "Browse verified sellers & products",
    description:
      "Search the marketplace, explore categories, or open the Verified Sellers directory to shop from approved student entrepreneurs and campus businesses.",
    cta: { label: "Explore products", href: "/explore" },
  },
  {
    step: "02",
    icon: CreditCard,
    title: "Checkout securely with Paystack",
    description:
      "Choose hostel/campus delivery or in-person collection, save your delivery address for next time, and pay securely via Paystack.",
    cta: { label: "View your cart", href: "/cart" },
  },
  {
    step: "03",
    icon: ShieldCheck,
    title: "Inspect & confirm with your 6-digit OTP",
    description:
      "Your payment is protected until handover. Once you inspect your order, share your 6-digit delivery OTP with the seller—or report an issue right from your order page.",
    cta: { label: "Track orders", href: "/orders" },
  },
];

const SELLER_STEPS = [
  {
    step: "01",
    icon: CheckCircle2,
    title: "Apply & get verified",
    description:
      "Submit your student ID or business details along with your payout bank account. Once approved by an admin, your verified badge and storefront go live.",
    cta: { label: "Apply to sell", href: "/become-a-seller" },
  },
  {
    step: "02",
    icon: Share2,
    title: "Upload inventory & share your store link",
    description:
      "Add product photos, prices, and stock quantities in your seller dashboard, then copy and share your unique store link on WhatsApp, Instagram, or X.",
    cta: { label: "Seller dashboard", href: "/seller" },
  },
  {
    step: "03",
    icon: PackageCheck,
    title: "Fulfil, verify OTP & receive settlement",
    description:
      "Accept paid orders, mark them ready or out for delivery, verify the buyer's 6-digit handover OTP to complete the order, and track payouts in Seller Finance.",
    cta: { label: "Seller finance", href: "/seller/finance" },
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-14 px-4 py-10">
      {/* Intro Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-brand-soft/50 p-6 sm:p-10">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          Welcome to cintiQ
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          How cintiQ works for Buyers &amp; Sellers
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Whether you&apos;re shopping around campus or running a student business, everything is organized into two clear paths with Paystack protection and OTP delivery confirmation.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <a href="#buyers-sector">
              <ShoppingBag className="size-4" aria-hidden />
              I&apos;m a Buyer
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="#sellers-sector">
              <Store className="size-4" aria-hidden />
              I&apos;m a Seller
            </a>
          </Button>
        </div>
      </section>

      {/* Sector 1: Buyers */}
      <section id="buyers-sector" aria-labelledby="buyers-heading" className="scroll-mt-24 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <ShoppingBag className="size-5" aria-hidden />
            </div>
            <div>
              <h2 id="buyers-heading" className="font-display text-2xl font-semibold">For Buyers</h2>
              <p className="text-sm text-muted-foreground">Shop safely from verified campus storefronts in 3 steps.</p>
            </div>
          </div>
          <Button asChild>
            <Link href="/explore">
              Start shopping <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {BUYER_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.step} className="flex flex-col justify-between rounded-xl border border-border bg-card p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand">STEP {item.step}</span>
                    <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <Icon className="size-4" aria-hidden />
                    </div>
                  </div>
                  <h3 className="font-display text-base font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
                <Link href={item.cta.href} className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                  {item.cta.label} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sector 2: Sellers */}
      <section id="sellers-sector" aria-labelledby="sellers-sector-heading" className="scroll-mt-24 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Store className="size-5" aria-hidden />
            </div>
            <div>
              <h2 id="sellers-sector-heading" className="font-display text-2xl font-semibold">For Sellers</h2>
              <p className="text-sm text-muted-foreground">Turn your campus hustle into a verified online storefront.</p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/become-a-seller">
              Apply to sell <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {SELLER_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.step} className="flex flex-col justify-between rounded-xl border border-border bg-card p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand">STEP {item.step}</span>
                    <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <Icon className="size-4" aria-hidden />
                    </div>
                  </div>
                  <h3 className="font-display text-base font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
                <Link href={item.cta.href} className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                  {item.cta.label} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
