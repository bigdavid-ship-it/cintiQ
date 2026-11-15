import { getSessionUser } from "@/lib/auth/session";
import { ContactForm } from "@/components/support/contact-form";

export const metadata = { title: "Customer support" };

export default async function ContactPage() {
  const user = await getSessionUser();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold">Customer support</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Need help with an order, payment, or seller account? Send us a message and it will be logged directly for our administration team.
      </p>
      <ContactForm defaults={{ name: user?.fullName ?? "", email: user?.email ?? "" }} />
    </main>
  );
}
