import { notFound } from "next/navigation";
import Link from "next/link";
import { Bookmark, CheckCircle2, Clock, ShieldCheck, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGallery } from "@/components/shop/product-gallery";
import { AddToCartForm } from "@/components/shop/add-to-cart-form";
import { ProductReviewForm } from "@/components/shop/product-review-form";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { toggleSavedProductAction } from "@/lib/marketplace/actions";
import { availability, type ProductRow } from "@/lib/types";
import { formatKobo } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = "*, product_images(storage_path,sort_order), seller_profiles(store_name,slug,location,seller_type), categories(name,slug)";

function formatSpeed(avgHours: number | null): string {
  if (avgHours === null) return "New seller";
  if (avgHours < 1) return "Under 1 hr";
  if (avgHours < 24) return `~${Math.round(avgHours)} hrs`;
  const days = Math.round(avgHours / 24);
  return `~${days} day${days === 1 ? "" : "s"}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("name").eq(UUID.test(id) ? "id" : "slug", id).maybeSingle();
  return { title: data?.name ?? "Product" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const isUuid = UUID.test(id);
  const [{ data }, user] = await Promise.all([
    supabase.from("products").select(SELECT).eq(isUuid ? "id" : "slug", id).maybeSingle(),
    getSessionUser(),
  ]);
  if (!data) notFound();

  const p = data as ProductRow & {
    seller_profiles: { store_name: string; slug: string; location: string; seller_type: string };
  };
  const images = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const stock = availability(p);

  const [isSavedRes, reviewsRes, speedRes, relatedRes, buyerOrdersRes] = await Promise.all([
    user
      ? supabase.from("saved_products").select("id").eq("user_id", user.id).eq("product_id", p.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("reviews")
      .select("id, order_id, rating, comment, created_at, profiles(full_name)")
      .eq("seller_id", p.seller_id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("orders")
      .select("paid_at, delivered_at")
      .eq("seller_id", p.seller_id)
      .in("status", ["delivered", "customer_confirmed", "completed"])
      .not("paid_at", "is", null)
      .not("delivered_at", "is", null)
      .limit(50),
    supabase
      .from("products")
      .select("*, product_images(storage_path,sort_order), seller_profiles(store_name,slug), categories(name,slug)")
      .eq("status", "active")
      .eq("category_id", p.category_id)
      .neq("id", p.id)
      .order("created_at", { ascending: false })
      .limit(8),
    user
      ? supabase
          .from("orders")
          .select("id")
          .eq("customer_id", user.id)
          .eq("seller_id", p.seller_id)
          .in("status", ["customer_confirmed", "completed"])
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),
  ]);

  const isSaved = !!isSavedRes.data;
  const reviews = reviewsRes.data ?? [];
  const reviewedOrderIds = new Set(reviews.map((r) => r.order_id));
  const eligibleOrderId = (buyerOrdersRes.data ?? []).find((o) => !reviewedOrderIds.has(o.id))?.id ?? null;
  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviewCount).toFixed(1) : null;

  const deliveredRows = speedRes.data ?? [];
  let avgHours: number | null = null;
  if (deliveredRows.length > 0) {
    const totalHours = deliveredRows.reduce((sum, r) => {
      const diff = new Date(r.delivered_at!).getTime() - new Date(r.paid_at!).getTime();
      return sum + Math.max(0, diff / 3_600_000);
    }, 0);
    avgHours = totalHours / deliveredRows.length;
  }

  const related = (relatedRes.data ?? []) as ProductRow[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/explore" className="hover:text-foreground">Explore</Link>
        <span>/</span>
        {p.categories && (
          <>
            <Link href={`/explore?category=${p.categories.slug}`} className="hover:text-foreground">{p.categories.name}</Link>
            <span>/</span>
          </>
        )}
        <span className="truncate text-foreground">{p.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery media={images} productName={p.name} />

        <div className="space-y-5">
          <div>
            {p.categories && (
              <Link href={`/explore?category=${p.categories.slug}`} className="text-xs font-semibold uppercase tracking-wider text-brand">
                {p.categories.name}
              </Link>
            )}
            <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">{p.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 font-medium">
                <Star className={`size-4 ${avgRating ? "fill-accent text-accent" : "text-muted-foreground"}`} aria-hidden />
                {avgRating ? `${avgRating} (${reviewCount} review${reviewCount === 1 ? "" : "s"})` : "No reviews yet"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="size-4 text-brand" aria-hidden />
                Fulfilment speed: <strong className="text-foreground">{formatSpeed(avgHours)}</strong>
              </span>
            </div>
          </div>

          <p className="font-display text-3xl font-semibold">{formatKobo(p.price_kobo)}</p>

          <p className="text-sm font-medium">
            {stock === "in_stock" && <span className="text-success">In stock ({p.quantity} available)</span>}
            {stock === "low_stock" && <span className="text-amber-700">Only {p.quantity} left in stock</span>}
            {stock === "out_of_stock" && <span className="text-danger">Out of stock</span>}
          </p>

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {p.description || "No description provided."}
          </p>

          {user ? (
            user.id === p.seller_id ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">This is your own product listing.</p>
            ) : (
              <div className="space-y-3">
                <AddToCartForm productId={p.id} maxQuantity={p.quantity} disabled={stock === "out_of_stock" || stock === "unavailable"} />
                <form action={toggleSavedProductAction.bind(null, p.id)}>
                  <Button type="submit" variant="outline" className="h-9 text-xs">
                    <Bookmark className={`size-3.5 ${isSaved ? "fill-current text-brand" : ""}`} aria-hidden />
                    {isSaved ? "Saved" : "Save product"}
                  </Button>
                </form>
              </div>
            )
          ) : (
            <div className="pt-1">
              <Link
                href={`/login?next=${encodeURIComponent(`/products/${p.id}`)}`}
                className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-5 text-sm font-medium text-brand-foreground hover:bg-brand/90"
              >
                Sign in to buy
              </Link>
            </div>
          )}

          {/* Verified Seller & Buyer Protection Card */}
          <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Sold by</p>
                <Link href={`/sellers/${p.seller_profiles.slug}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
                  {p.seller_profiles.store_name}
                  <CheckCircle2 className="size-4 text-brand" aria-label="Verified seller" />
                </Link>
                <p className="text-xs capitalize text-muted-foreground">
                  {p.seller_profiles.seller_type} · {p.seller_profiles.location}
                </p>
              </div>
              <Link href={`/sellers/${p.seller_profiles.slug}`} className="text-xs font-medium text-brand hover:underline">
                View store →
              </Link>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-brand" aria-hidden />
              <span>Protected by cintiQ OTP delivery confirmation &amp; dispute resolution.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Reviews */}
      <section className="mt-14 border-t border-border pt-10" aria-labelledby="reviews-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="reviews-heading" className="font-display text-xl font-semibold">
            Customer reviews {reviewCount > 0 ? `(${reviewCount})` : ""}
          </h2>
          {avgRating && (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Star className="size-4 fill-accent text-accent" aria-hidden />
              {avgRating} out of 5
            </p>
          )}
        </div>

        {eligibleOrderId && (
          <ProductReviewForm
            orderId={eligibleOrderId}
            sellerId={p.seller_id}
            productName={p.name}
          />
        )}

        {reviews.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No customer reviews for this seller yet. Verified buyers can leave a review after confirming delivery.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {reviews.map((r) => {
              const reviewer = (r.profiles as unknown as { full_name: string } | null)?.full_name?.trim() || "Verified buyer";
              return (
                <li key={r.id} className="rounded-lg border border-border bg-card p-4 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{reviewer}</span>
                    <span className="inline-flex items-center gap-0.5 text-accent" aria-label={`${r.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star key={idx} className={`size-3.5 ${idx < r.rating ? "fill-accent text-accent" : "text-border"}`} aria-hidden />
                      ))}
                    </span>
                  </div>
                  {r.comment && <p className="text-muted-foreground">{r.comment}</p>}
                  <p className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-NG")}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* You May Also Like (Same Category) */}
      {related.length > 0 && (
        <section className="mt-14 border-t border-border pt-10" aria-labelledby="related">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="related" className="font-display text-xl font-semibold">You may also like</h2>
            {p.categories && (
              <Link href={`/explore?category=${p.categories.slug}`} className="text-sm font-medium text-brand hover:underline">
                More in {p.categories.name} →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((r) => <ProductCard key={r.id} product={r} />)}
          </div>
        </section>
      )}
    </main>
  );
}
