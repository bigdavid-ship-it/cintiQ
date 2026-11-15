import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AddressForm } from "@/components/account/address-form";
import { deleteAddressAction } from "@/lib/cart/actions";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/account");
  const supabase = await createClient();
  const { data: addresses } = await supabase
    .from("delivery_addresses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Your account</h1>
      <dl className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Name</dt><dd>{user.fullName || "Not set"}</dd></div>
        <div><dt className="text-muted-foreground">Email</dt><dd>{user.email}</dd></div>
      </dl>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/orders" className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted">Your orders</Link>
        <Link href="/account/saved" className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted">Saved products</Link>
        <Link href="/account/notifications" className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted">Notifications</Link>
      </div>

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-lg font-semibold">Saved delivery addresses</h2>
        {!addresses?.length ? (
          <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {addresses.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 p-4 text-sm">
                <div>
                  <p className="font-medium">{a.label}</p>
                  <p>{a.recipient_name} · {a.phone}</p>
                  <p className="text-muted-foreground">{a.address}</p>
                </div>
                <form action={deleteAddressAction.bind(null, a.id)}>
                  <Button type="submit" variant="ghost" className="h-8 text-xs text-danger">Delete</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddressForm />
      </section>
    </main>
  );
}
