import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/payments/paystack";
import { sendUserPushAndEmail } from "@/lib/notifications/push";
import { callSellerForNewOrder } from "@/lib/notifications/voice";

export type ReconcileResult =
  | { status: "confirmed" | "already_processed" | "paid_refund_required" }
  | { status: "failed" | "abandoned" | "amount_mismatch" | "unknown_reference"; reason?: string };

/**
 * Independently verifies a Paystack transaction and applies the result atomically
 * via confirm_payment / fail_payment. Safe to call from both callback and webhook.
 */
export async function reconcilePaystackReference(reference: string): Promise<ReconcileResult> {
  const tx = await verifyTransaction(reference);
  const admin = createAdminClient();

  if (tx.status === "success") {
    const { data, error } = await admin.rpc("confirm_payment", {
      _reference: tx.reference,
      _provider_tx: String(tx.id),
      _amount: tx.amount,
      _currency: tx.currency,
      _channel: tx.channel ?? "unknown",
      _fees: tx.fees ?? 0,
      _paid_at: tx.paid_at ?? new Date().toISOString(),
      _raw: tx as unknown as Record<string, unknown>,
    });
    if (error) throw new Error(error.message);
    if (data === "amount_mismatch") return { status: "amount_mismatch", reason: "Payment amount did not match order total." };
    if (data === "unknown_reference") return { status: "unknown_reference" };

    if (data === "confirmed") {
      const { data: chk } = await admin
        .from("checkouts")
        .select("id, user_id, orders(id, seller_id)")
        .eq("reference", tx.reference)
        .maybeSingle();

      if (chk) {
        const orderList = (chk.orders as unknown as { id: string; seller_id: string }[] | null) ?? [];
        await Promise.allSettled([
          sendUserPushAndEmail({
            userId: chk.user_id,
            title: "Payment confirmed",
            body: `Your order (${tx.reference}) is confirmed and sellers have been notified.`,
            link: orderList.length === 1 ? `/orders/${orderList[0].id}` : "/orders",
          }),
          ...orderList.map((o) =>
            sendUserPushAndEmail({
              userId: o.seller_id,
              title: "New paid order",
              body: `You received a new paid order (#${o.id.slice(0, 8)}). Open your seller dashboard to accept and fulfil.`,
              link: `/seller/orders/${o.id}`,
            }),
          ),
          ...orderList.map((o) =>
            callSellerForNewOrder({
              sellerId: o.seller_id,
              orderId: o.id,
            }),
          ),
        ]);
      }
    }

    return { status: data as "confirmed" | "already_processed" | "paid_refund_required" };
  }

  if (tx.status === "failed" || tx.status === "reversed") {
    await admin.rpc("fail_payment", {
      _reference: tx.reference,
      _reason: tx.gateway_response ?? `Paystack status: ${tx.status}`,
    });
    return { status: "failed", reason: tx.gateway_response ?? "Payment was declined." };
  }

  return { status: "abandoned", reason: tx.gateway_response ?? `Payment status: ${tx.status}` };
}
