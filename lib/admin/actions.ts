"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConfigured } from "@/lib/env";
import { createPaystackRefund } from "@/lib/payments/paystack";
import { executeSellerSettlement } from "@/lib/payments/settlement";

export async function initiateSettlementAction(orderId: string) {
  const adminUser = await requireRole(["admin"]);
  const res = await executeSellerSettlement({ orderId, actorId: adminUser.id });
  revalidatePath("/admin/settlements");
  revalidatePath("/seller/finance");
  const q = res.ok ? `done=${encodeURIComponent(res.message)}` : `error=${encodeURIComponent(res.message)}`;
  redirect(`/admin/settlements?${q}`);
}

export async function processRefundAction(orderId: string, fd: FormData) {
  await requireRole(["admin"]);
  if (!isConfigured("PAYSTACK_SECRET_KEY")) {
    redirect(`/admin/settlements?error=${encodeURIComponent("PAYSTACK_SECRET_KEY is not configured. Cannot issue Paystack refund.")}`);
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, total_kobo, status, checkouts(reference)")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.status !== "refund_pending") {
    redirect(`/admin/settlements?error=${encodeURIComponent("Order is not awaiting refund.")}`);
  }

  const ref = (order.checkouts as unknown as { reference: string } | null)?.reference;
  if (!ref) {
    redirect(`/admin/settlements?error=${encodeURIComponent("Payment reference not found.")}`);
  }

  const note = String(fd.get("reason") ?? "Order refund").trim().slice(0, 300);
  try {
    const refund = await createPaystackRefund({
      transactionReference: ref,
      amountKobo: order.total_kobo,
      merchantNote: note,
    });
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_order_refunded", {
      _order_id: orderId,
      _provider_ref: String(refund.id),
      _reason: note,
    });
    if (error) redirect(`/admin/settlements?error=${encodeURIComponent(error.message)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Refund failed";
    redirect(`/admin/settlements?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/admin/settlements");
  revalidatePath("/orders");
  redirect(`/admin/settlements?done=${encodeURIComponent("Refund issued via Paystack.")}`);
}

export async function updateSellerCommissionAction(sellerId: string, fd: FormData) {
  await requireRole(["admin"]);
  const raw = String(fd.get("commissionPercent") ?? "").trim();
  const pct = raw === "" ? null : Number(raw);
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 50)) {
    redirect(`/admin/settings?error=${encodeURIComponent("Commission must be blank (default) or between 0 and 50%.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_seller_commission", { _seller_id: sellerId, _percent: pct });
  if (error) redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/settings");
  redirect("/admin/settings?done=commission");
}

export async function updateSettingAction(key: string, fd: FormData) {
  await requireRole(["admin"]);
  const raw = String(fd.get("value") ?? "").trim();
  let jsonValue: unknown = raw;
  if (key !== "settlement_mode") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      redirect(`/admin/settings?error=${encodeURIComponent("Enter a valid non-negative number.")}`);
    }
    jsonValue = n;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_setting", { _key: key, _value: jsonValue });
  if (error) redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/settings");
  redirect("/admin/settings?done=setting");
}

export async function setUserSuspendedAction(userId: string, suspend: boolean, fd: FormData) {
  await requireRole(["admin"]);
  const reason = String(fd.get("reason") ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_suspended", {
    _target: userId,
    _suspend: suspend,
    _reason: reason,
  });
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/users");
  redirect("/admin/users?done=1");
}
