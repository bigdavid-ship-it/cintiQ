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

export async function markManualSettlementAction(orderId: string, fd: FormData) {
  const adminUser = await requireRole(["admin"]);
  const transferRef = String(fd.get("transferRef") ?? "").trim().slice(0, 100);
  if (transferRef.length < 3) {
    redirect(`/admin/settlements?error=${encodeURIComponent("Enter a valid bank transfer reference (at least 3 characters).")}`);
  }

  const admin = createAdminClient();
  const [{ data: order }, { data: comm }, { data: existing }] = await Promise.all([
    admin.from("orders").select("id, seller_id, status").eq("id", orderId).maybeSingle(),
    admin.from("commissions").select("seller_proceeds_kobo").eq("order_id", orderId).maybeSingle(),
    admin.from("seller_settlements").select("status").eq("order_id", orderId).maybeSingle(),
  ]);

  if (!order || !comm) {
    redirect(`/admin/settlements?error=${encodeURIComponent("Order or commission record not found.")}`);
  }
  if (order.status !== "completed") {
    redirect(`/admin/settlements?error=${encodeURIComponent("Order must be completed before marking settled.")}`);
  }
  if (existing?.status === "settled") {
    redirect(`/admin/settlements?done=${encodeURIComponent("Order is already marked settled.")}`);
  }

  const { error } = await admin.from("seller_settlements").upsert(
    {
      order_id: order.id,
      seller_id: order.seller_id,
      amount_kobo: comm.seller_proceeds_kobo,
      provider: "manual_bank_transfer",
      status: "settled",
      provider_reference: transferRef,
      failure_reason: null,
      initiated_by: adminUser.id,
      settled_at: new Date().toISOString(),
    },
    { onConflict: "order_id" },
  );

  if (error) {
    redirect(`/admin/settlements?error=${encodeURIComponent("Could not record manual settlement.")}`);
  }

  await Promise.all([
    admin.rpc("notify", {
      _user: order.seller_id,
      _type: "settlement.update",
      _title: "Settlement sent",
      _body: `Manual bank payout for order #${order.id.slice(0, 8)} (Ref: ${transferRef}) has been completed.`,
      _link: "/seller/finance",
    }),
    admin.rpc("write_audit", {
      _actor: adminUser.id,
      _action: "settlement.manual",
      _entity_type: "seller_settlement",
      _entity_id: order.id,
      _metadata: { reference: transferRef, amount_kobo: comm.seller_proceeds_kobo },
    }),
  ]);

  revalidatePath("/admin/settlements");
  revalidatePath("/seller/finance");
  redirect(`/admin/settlements?done=${encodeURIComponent(`Marked order #${order.id.slice(0, 8)} as manually settled (${transferRef}).`)}`);
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
