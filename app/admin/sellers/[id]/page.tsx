import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { reviewApplicationAction, setSellerStatusAction } from "@/lib/sellers/actions";

export const metadata = { title: "Review application" };

export default async function ReviewApplication({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireRole(["admin"], `/admin/sellers/${id}`);
  const supabase = await createClient();
  const { data: app } = await supabase.from("seller_applications").select("*").eq("id", id).maybeSingle();
  if (!app) notFound();
  const [{ data: bank }, { data: docs }, { data: cats }, { data: store }] = await Promise.all([
    supabase.from("seller_bank_accounts").select("*").eq("application_id", id).maybeSingle(),
    supabase.from("seller_verification_documents").select("*").eq("application_id", id),
    supabase.from("categories").select("id,name").in("id", app.category_ids),
    supabase.from("seller_profiles").select("status,suspended_reason").eq("user_id", app.user_id).maybeSingle(),
  ]);
  const signed = await Promise.all(
    (docs ?? []).map(async (d) => ({ ...d, url: (await supabase.storage.from("seller-documents").createSignedUrl(d.storage_path, 300)).data?.signedUrl })),
  );
  const open = app.status === "pending" || app.status === "under_review";
  const rows: [string, string | null][] = [
    ["Applicant", app.full_name], ["Type", app.seller_type], ["Phone", app.phone], ["Email", app.email],
    ["Student ID", app.student_id_number], ["Institution", app.institution], ["Registration no.", app.business_registration_number],
    ["Location", app.business_location], ["Categories", (cats ?? []).map((c) => c.name).join(", ")],
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">{app.business_name}</h1>
        <StatusBadge status={app.status} />
      </div>
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{sp.error}</p>}
      {sp.done && <p role="status" className="mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-success">Done: {sp.done.replace("_", " ")}.</p>}

      <dl className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-2">
        {rows.filter(([, v]) => v).map(([k, v]) => (<div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>))}
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Description</dt><dd className="whitespace-pre-wrap">{app.description}</dd></div>
      </dl>

      <h2 className="font-display mt-8 text-lg font-semibold">Settlement bank account</h2>
      {bank ? (
        <p className="mt-2 text-sm">{bank.bank_name} · {bank.account_number} · {bank.account_name} <span className="text-muted-foreground">({bank.is_verified ? "verified" : "not yet verified with provider"})</span></p>
      ) : <p className="mt-2 text-sm text-muted-foreground">None on file.</p>}

      <h2 className="font-display mt-8 text-lg font-semibold">Verification documents</h2>
      {signed.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No documents uploaded.</p> : (
        <ul className="mt-2 space-y-1 text-sm">
          {signed.map((d) => (
            <li key={d.id}>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{d.doc_type.replace("_", " ")}: {d.original_name}</a> : d.original_name}</li>
          ))}
        </ul>
      )}
      {signed.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Links expire after 5 minutes.</p>}

      {app.status === "rejected" && <p className="mt-6 text-sm"><strong>Rejection reason:</strong> {app.rejection_reason}</p>}

      {open && (
        <section className="mt-8 space-y-4 border-t border-border pt-6">
          {app.status === "pending" && (
            <form action={reviewApplicationAction.bind(null, id, "under_review")}><Button type="submit" variant="outline">Start review</Button></form>
          )}
          <form action={reviewApplicationAction.bind(null, id, "approved")}><Button type="submit">Approve seller</Button></form>
          <form action={reviewApplicationAction.bind(null, id, "rejected")} className="space-y-2">
            <label htmlFor="reason" className="text-sm font-medium">Rejection reason (shown to the applicant)</label>
            <textarea id="reason" name="reason" required minLength={5} maxLength={1000} className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
            <Button type="submit" variant="danger">Reject application</Button>
          </form>
        </section>
      )}

      {app.status === "approved" && store && (
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-display text-lg font-semibold">Seller account <StatusBadge status={store.status} /></h2>
          {store.status === "active" ? (
            <form action={setSellerStatusAction.bind(null, id, app.user_id, true)} className="mt-3 space-y-2">
              <label htmlFor="sreason" className="text-sm font-medium">Suspension reason</label>
              <textarea id="sreason" name="reason" required minLength={5} className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
              <Button type="submit" variant="danger">Suspend seller</Button>
            </form>
          ) : (
            <form action={setSellerStatusAction.bind(null, id, app.user_id, false)} className="mt-3">
              <p className="mb-2 text-sm text-muted-foreground">Suspended: {store.suspended_reason}</p>
              <Button type="submit">Reactivate seller</Button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
