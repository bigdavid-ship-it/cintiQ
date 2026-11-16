"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseApplicationForm, rejectionSchema } from "@/lib/validation/seller";
import { filesFrom, validateUpload } from "@/lib/uploads";
import { sendUserPushAndEmail } from "@/lib/notifications/push";
import type { ActionState } from "@/lib/auth/actions";

const DOC_FIELDS = ["student_id", "government_id", "business_registration", "proof_of_address"] as const;

export async function submitApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["customer"], "/seller/apply");
  const parsed = parseApplicationForm(fd);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  // Documents: student -> student ID required; business -> registration or government ID required
  const docs: { type: (typeof DOC_FIELDS)[number]; file: File }[] = [];
  for (const type of DOC_FIELDS) for (const file of filesFrom(fd, type).slice(0, 1)) docs.push({ type, file });
  const has = (t: string) => docs.some((x) => x.type === t);
  if (d.sellerType === "student" && !has("student_id"))
    return { ok: false, fieldErrors: { student_id: ["Upload your student ID card"] } };
  if (d.sellerType === "business" && !has("business_registration") && !has("government_id"))
    return { ok: false, fieldErrors: { business_registration: ["Upload a business registration or government ID"] } };

  const supabase = await createClient();

  const { data: cats } = await supabase.from("categories").select("id").in("id", d.categoryIds).eq("is_active", true);
  if ((cats?.length ?? 0) !== new Set(d.categoryIds).size)
    return { ok: false, fieldErrors: { categoryIds: ["One or more categories are invalid"] } };

  const checked = [];
  for (const doc of docs) {
    const v = await validateUpload(doc.file, "document");
    if (!v.ok) return { ok: false, fieldErrors: { [doc.type]: [v.error] } };
    checked.push({ ...doc, v });
  }

  // Upload first (own folder), then record; compensate on failure.
  const uploaded: { type: string; path: string; name: string; mime: string; size: number }[] = [];
  const cleanupFiles = () => supabase.storage.from("seller-documents").remove(uploaded.map((u) => u.path));
  for (const c of checked) {
    const path = `${user.id}/${randomUUID()}.${c.v.ext}`;
    const { error } = await supabase.storage.from("seller-documents").upload(path, c.v.bytes, { contentType: c.v.mime });
    if (error) {
      await cleanupFiles();
      return { ok: false, message: "A document could not be uploaded. Please try again." };
    }
    uploaded.push({ type: c.type, path, name: c.file.name.slice(0, 200), mime: c.v.mime, size: c.file.size });
  }

  const { data: app, error: appErr } = await supabase
    .from("seller_applications")
    .insert({
      user_id: user.id, seller_type: d.sellerType, full_name: d.fullName, business_name: d.businessName,
      phone: d.phone, email: d.email, student_id_number: d.studentIdNumber ?? null, institution: d.institution ?? null,
      business_location: d.businessLocation, business_registration_number: d.businessRegistrationNumber ?? null,
      description: d.description, category_ids: d.categoryIds,
    })
    .select("id")
    .single();
  if (appErr || !app) {
    await cleanupFiles();
    const dup = appErr?.code === "23505";
    return { ok: false, message: dup ? "You already have an open seller application." : "We could not submit your application." };
  }

  const { error: bankErr } = await supabase.from("seller_bank_accounts").insert({
    user_id: user.id, application_id: app.id, bank_name: d.bankName, account_number: d.accountNumber, account_name: d.accountName,
  });
  const { error: docErr } = bankErr
    ? { error: null }
    : await supabase.from("seller_verification_documents").insert(
        uploaded.map((u) => ({
          application_id: app.id, user_id: user.id, doc_type: u.type, storage_path: u.path,
          original_name: u.name, mime_type: u.mime, size_bytes: u.size,
        })),
      );
  if (bankErr || docErr) {
    // Roll back the half-created application so the user can retry cleanly.
    await createAdminClient().from("seller_applications").delete().eq("id", app.id);
    await cleanupFiles();
    return { ok: false, message: "We could not save your application details. Please try again." };
  }

  await sendUserPushAndEmail({
    userId: user.id,
    title: "Application received",
    body: "We received your seller application and will review it shortly.",
    link: "/seller",
  });

  revalidatePath("/seller");
  redirect("/seller");
}

export async function reviewApplicationAction(applicationId: string, decision: "under_review" | "approved" | "rejected", fd: FormData) {
  await requireRole(["admin"]);
  let reason: string | null = null;
  if (decision === "rejected") {
    const r = rejectionSchema.safeParse({ reason: fd.get("reason") });
    if (!r.success) redirect(`/admin/sellers/${applicationId}?error=${encodeURIComponent(r.error.issues[0].message)}`);
    reason = r.data.reason;
  }
  const supabase = await createClient(); // RPC re-checks admin role inside the database
  const { error } = await supabase.rpc("review_seller_application", { _id: applicationId, _decision: decision, _reason: reason });
  if (error) redirect(`/admin/sellers/${applicationId}?error=${encodeURIComponent(error.message)}`);

  const { data: app } = await createAdminClient()
    .from("seller_applications")
    .select("user_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (app?.user_id) {
    const title =
      decision === "approved"
        ? "Welcome to cintiQ Sellers — Your store is approved!"
        : decision === "rejected"
          ? "Application not approved"
          : "Application under review";
    const body =
      decision === "approved"
        ? [
            "Congratulations! Your cintiQ seller store is now active.",
            "",
            "Here's how to start selling:",
            "1. Add your products with photos or short videos in Seller Dashboard.",
            "2. Share your unique store link on WhatsApp, Instagram, and campus groups.",
            "3. Verify the buyer's 6-digit OTP at handover and manage your Paystack-verified bank account under Finance.",
          ].join("\n")
        : decision === "rejected"
          ? reason || "Your seller application was not approved."
          : "An administrator is reviewing your seller application.";
    await sendUserPushAndEmail({ userId: app.user_id, title, body, link: "/seller" });
  }

  revalidatePath("/admin/sellers");
  redirect(`/admin/sellers/${applicationId}?done=${decision}`);
}

export async function setSellerStatusAction(applicationId: string, sellerUserId: string, suspend: boolean, fd: FormData) {
  await requireRole(["admin"]);
  const reason = String(fd.get("reason") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_seller_status", { _user: sellerUserId, _suspend: suspend, _reason: suspend ? reason : null });
  if (error) redirect(`/admin/sellers/${applicationId}?error=${encodeURIComponent(error.message)}`);
  await sendUserPushAndEmail({
    userId: sellerUserId,
    title: suspend ? "Seller account suspended" : "Seller account reactivated",
    body: suspend ? reason || "Your seller account has been suspended by an administrator." : "Your seller store is active again.",
    link: "/seller",
  });
  revalidatePath("/admin/sellers");
  redirect(`/admin/sellers/${applicationId}?done=${suspend ? "suspended" : "reactivated"}`);
}
