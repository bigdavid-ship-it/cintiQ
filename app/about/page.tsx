import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "About cintiQ" };

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <h1 className="font-display text-3xl font-semibold">About cintiQ</h1>
      <p className="text-muted-foreground">
        cintiQ is a supplier-driven campus commerce network built for Nigerian university communities. We connect students with verified student entrepreneurs and physical businesses operating around campus.
      </p>
      <p className="text-muted-foreground">
        Unlike informal social-media trading, cintiQ provides structured product discovery, verified seller onboarding, multi-seller cart checkout powered by Paystack, OTP-verified delivery confirmation, and fair dispute resolution.
      </p>
      <div className="flex gap-3 pt-4">
        <Button asChild><Link href="/explore">Explore marketplace</Link></Button>
        <Button asChild variant="outline"><Link href="/contact">Contact support</Link></Button>
      </div>
    </main>
  );
}
