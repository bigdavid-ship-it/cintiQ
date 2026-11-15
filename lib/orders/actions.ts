"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireActiveSeller, requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { filesFrom, validateUpload } from "@/lib/uploads";
import { sendUserPushAndEmail } from "@/lib/notifications/push";
import type { ActionState } from "@/lib/auth/actions";
import type { OrderStatus } from "@/lib/orders/transitions";

export async function sellerAdvanceOrderAction(
  orderId: string,
  nextStatus: OrderStatus,
  _: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const seller = await requireActiveSeller(`/seller/orders/${orderId}`);
  const note = String(fd.get("note") ?? "").trim() || null;

  if (nextStatus === "rejected" && (!note || note.length < 5)) {
    return { ok: false, message: "Provide a rejection reason (at least 5 characters)." };
  }

  const supabase = await createClient();
  let evidencePath: string | null = null;
  const files = filesFrom(fd, "evidence");
  if (files.length > 0) {
    const v = await validateUpload(files[0], "document");
    if (!v.ok) return { ok: false, message: v.error };
    const path = `${seller.id}/delivery/${orderId}-${randomUUID()}.${v.ext}`;
    const { error: upErr } = await supabase.storage.from("order-evidence").upload(path, v.bytes, { contentType: v.mime });
    if (upErr) return { ok: false, message: "Could not upload delivery evidence." };
    evidencePath = path;
  }

  const { error } = await supabase.rpc("seller_advance_order", {
    _order_id: orderId,
    _next: nextStatus,
    _note: note,
    _evidence_path: evidencePath,
  });

  if (error) return { ok: false, message: error.message };

  const { data: ord } = await supabase.from("orders").select("customer_id").eq("id", orderId).maybeSingle();
  if (ord?.customer_id) {
    await sendUserPushAndEmail({
      userId: ord.customer_id,
      title: `Order ${nextStatus.replace(/_/g, " ")}`,
      body: `Order #${orderId.slice(0, 8)} is now ${nextStatus.replace(/_/g, " ")}.`,
      link: `/orders/${orderId}`,
    }).catch(() => {});
  }

  revalidatePath("/seller/orders");
  revalidatePath(`/seller/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true, message: `Order updated to ${nextStatus.replace(/_/g, " ")}.` };
}

export async function customerCancelOrderAction(orderId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(["customer", "seller", "admin", "super_admin"], "/orders");
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 3) return { ok: false, message: "Provide a cancellation reason." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_cancel_order", { _order_id: orderId, _reason: reason });
  if (error) return { ok: false, message: error.message };

  const { data: ord } = await supabase.from("orders").select("seller_id").eq("id", orderId).maybeSingle();
  if (ord?.seller_id) {
    await sendUserPushAndEmail({
      userId: ord.seller_id,
      title: "Order cancelled by buyer",
      body: `Order #${orderId.slice(0, 8)} was cancelled before acceptance.`,
      link: `/seller/orders/${orderId}`,
    }).catch(() => {});
  }
  revalidatePath("/orders");
  return { ok: true, message: "Order cancelled. Refund is pending." };
}

export type OtpState = { ok: boolean; otp?: string; expiresAt?: string; message?: string };

export async function requestDeliveryOtpAction(orderId: string): Promise<OtpState> {
  await requireRole(["customer", "seller", "admin", "super_admin"], "/orders");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_delivery_otp", { _order_id: orderId });
  if (error || !data) return { ok: false, message: error?.message ?? "Could not generate OTP." };
  const res = data as { otp: string; expires_at: string };
  revalidatePath("/orders");
  return { ok: true, otp: res.otp, expiresAt: res.expires_at };
}

export async function verifyDeliveryOtpAction(orderId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(["customer", "seller", "admin", "super_admin"]);
  const otp = String(fd.get("otp") ?? "").trim();
  if (!/^\d{6}$/.test(otp)) return { ok: false, message: "Enter the 6-digit confirmation code." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_delivery_otp", { _order_id: orderId, _otp: otp });
  if (error) return { ok: false, message: error.message };

  const { data: ord } = await supabase.from("orders").select("seller_id").eq("id", orderId).maybeSingle();
  if (ord?.seller_id) {
    await sendUserPushAndEmail({
      userId: ord.seller_id,
      title: "Delivery confirmed",
      body: `Buyer confirmed delivery for order #${orderId.slice(0, 8)}. Settlement is now eligible.`,
      link: `/seller/orders/${orderId}`,
    }).catch(() => {});
  }
  revalidatePath("/orders");
  revalidatePath(`/seller/orders/${orderId}`);
  return { ok: true, message: "Delivery confirmed. Order completed." };
}

const disputeSchema = z.object({
  reason: z.enum(["non_delivery", "wrong_product", "damaged_product", "missing_items", "other"]),
  description: z.string().trim().min(10, "Describe the issue (at least 10 characters)").max(2000),
});

export async function openDisputeAction(orderId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/orders");
  const parsed = disputeSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const files = filesFrom(fd, "evidence").slice(0, 3);
  const checked = [];
  for (const f of files) {
    const v = await validateUpload(f, "document");
    if (!v.ok) return { ok: false, message: `${f.name}: ${v.error}` };
    checked.push({ f, v });
  }

  const supabase = await createClient();
  const { data: disputeId, error } = await supabase.rpc("open_dispute", {
    _order_id: orderId,
    _reason: parsed.data.reason,
    _description: parsed.data.description,
  });
  if (error || !disputeId) return { ok: false, message: error?.message ?? "Could not open dispute." };

  for (const c of checked) {
    const path = `${user.id}/dispute/${disputeId}-${randomUUID()}.${c.v.ext}`;
    const up = await supabase.storage.from("order-evidence").upload(path, c.v.bytes, { contentType: c.v.mime });
    if (!up.error) {
      await supabase.from("dispute_evidence").insert({
        dispute_id: disputeId,
        uploaded_by: user.id,
        storage_path: path,
        original_name: c.f.name.slice(0, 200),
        mime_type: c.v.mime,
        size_bytes: c.f.size,
      });
    }
  }

  revalidatePath("/orders");
  revalidatePath(`/seller/orders/${orderId}`);
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Dispute opened. An administrator will review it." };
}

export async function uploadDisputeEvidenceAction(disputeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"]);
  const files = filesFrom(fd, "evidence");
  if (files.length === 0) return { ok: false, message: "Select a file to upload." };
  const v = await validateUpload(files[0], "document");
  if (!v.ok) return { ok: false, message: v.error };

  const note = String(fd.get("note") ?? "").trim().slice(0, 500) || null;
  const supabase = await createClient();
  const path = `${user.id}/dispute/${disputeId}-${randomUUID()}.${v.ext}`;
  const up = await supabase.storage.from("order-evidence").upload(path, v.bytes, { contentType: v.mime });
  if (up.error) return { ok: false, message: "Could not upload file." };

  const { error } = await supabase.from("dispute_evidence").insert({
    dispute_id: disputeId,
    uploaded_by: user.id,
    storage_path: path,
    original_name: files[0].name.slice(0, 200),
    mime_type: v.mime,
    size_bytes: files[0].size,
    note,
  });
  if (error) {
    await supabase.storage.from("order-evidence").remove([path]);
    return { ok: false, message: "Could not save evidence record." };
  }

  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath("/orders");
  revalidatePath("/seller/orders");
  return { ok: true, message: "Evidence uploaded." };
}

export async function resolveDisputeAction(
  disputeId: string,
  decision: "under_investigation" | "resolved_refund" | "resolved_release",
  fd: FormData,
) {
  await requireRole(["admin"]);
  const note = String(fd.get("note") ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_dispute", {
    _dispute_id: disputeId,
    _decision: decision,
    _note: note,
  });
  if (error) redirect(`/admin/disputes/${disputeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${disputeId}`);
  redirect(`/admin/disputes/${disputeId}?done=${decision}`);
}

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export async function submitReviewAction(orderId: string, sellerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/orders");
  const parsed = reviewSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: "Choose a rating from 1 to 5." };
  const supabase = await createClient();
  const { error } = await supabase.from("reviews").insert({
    order_id: orderId,
    customer_id: user.id,
    seller_id: sellerId,
    rating: parsed.data.rating,
    comment: parsed.data.comment || null,
  });
  if (error) return { ok: false, message: error.code === "23505" ? "You already reviewed this order." : "Could not submit review." };
  revalidatePath("/orders");
  revalidatePath("/products", "layout");
  return { ok: true, message: "Review submitted." };
}
