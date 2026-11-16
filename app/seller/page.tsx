import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { ShareStoreLink } from "@/components/seller/share-store-link";

export const metadata = { title: "Seller dashboard" };

export default async function SellerHome() {
  const user = await requireRole(["customer", "seller", "admin"], "/seller");
  const supabase = await createClient();
  const [{ data: store }, { data: app }] = await Promise.all([
    supabase.from("seller_profiles").select("store_name,slug,status,suspended_reason").eq("user_id", user.id).maybeSingle(),
    supabase.from("seller_applications").select("id,status,rejection_reason,business_name,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (store) {
    const [{ count: total }, { count: live }, { count: out }, { count: completedSales }] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("seller_id", user.id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "active"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "active").eq("quantity", 0),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "completed"),
    ]);
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">{store.store_name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">Store status <StatusBadge status={store.status} /></p>
          </div>
          {store.status === "active" && (
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link href={`/sellers/${store.slug}`}>View storefront</Link></Button>
              <Button asChild><Link href="/seller/products/new">Add product</Link></Button>
            </div>
          )}
        </div>
        {store.status === "active" && (
          <div className="mt-6">
            <ShareStoreLink slug={store.slug} storeName={store.store_name} />
          </div>
        )}
        {store.status === "suspended" && (
          <p role="alert" className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
            Your seller account is suspended{store.suspended_reason ? `: ${store.suspended_reason}` : "."} Your products are hidden from customers. Contact cintiQ support.
          </p>
        )}
        <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[["Products", total ?? 0], ["Published", live ?? 0], ["Out of stock", out ?? 0], ["Completed sales", completedSales ?? 0]].map(([k, v]) => (
            <div key={String(k)} className="rounded-lg border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="font-display mt-1 text-2xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 flex flex-wrap gap-6">
          <Link href="/seller/orders" className="text-sm font-medium text-brand underline">Manage orders</Link>
          <Link href="/seller/products" className="text-sm font-medium text-brand underline">Manage products &amp; inventory</Link>
          <Link href="/seller/finance" className="text-sm font-medium text-brand underline">Finance &amp; settlements</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Sell on cintiQ</h1>
      {!app || app.status === "rejected" ? (
        <>
          {app?.status === "rejected" && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
              Your previous application was not approved{app.rejection_reason ? `: ${app.rejection_reason}` : "."}
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">Apply to open a verified storefront. Applications are reviewed by the cintiQ team before you can publish products.</p>
          <Button asChild className="mt-6"><Link href="/seller/apply">{app ? "Submit a new application" : "Start application"}</Link></Button>
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-card p-5">
          <p className="flex items-center gap-2 text-sm">Application for <strong>{app.business_name}</strong> <StatusBadge status={app.status} /></p>
          <p className="mt-2 text-sm text-muted-foreground">
            {app.status === "pending" ? "We have received your application. You will be notified once review begins." : "An administrator is reviewing your application."}
          </p>
        </div>
      )}
    </main>
  );
}
