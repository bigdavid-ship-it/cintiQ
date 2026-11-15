import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ApplicationForm } from "@/components/seller/application-form";

export const metadata = { title: "Seller application" };

export default async function ApplyPage() {
  const user = await requireRole(["customer"], "/seller/apply");
  const supabase = await createClient();
  const [{ data: open }, { data: categories }] = await Promise.all([
    supabase.from("seller_applications").select("id").eq("user_id", user.id).in("status", ["pending", "under_review", "approved"]).maybeSingle(),
    supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order"),
  ]);
  if (open) redirect("/seller");
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Seller application</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">Tell us about you and your store. You cannot publish products until an administrator approves your application.</p>
      <ApplicationForm categories={categories ?? []} defaults={{ fullName: user.fullName, email: user.email }} />
    </main>
  );
}
