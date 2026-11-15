import "server-only";
import { isConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTransferRecipient, initiateTransfer } from "@/lib/payments/paystack";

export type SettlementMode = "unconfigured" | "paystack_split_manual" | "paystack_transfer";

export type SettlementResult = {
  ok: boolean;
  status: "pending_provider" | "processing" | "settled" | "failed";
  message: string;
  providerReference?: string;
};

/**
 * Isolated settlement layer.
 * Never simulates payouts. Only executes transfers when a supported mode
 * and valid Paystack credentials + seller bank codes are configured.
 */
export async function executeSellerSettlement(params: {
  orderId: string;
  actorId: string;
}): Promise<SettlementResult> {
  const admin = createAdminClient();

  const [{ data: modeRow }, { data: order }, { data: comm }, { data: existing }] = await Promise.all([
    admin.from("platform_settings").select("value").eq("key", "settlement_mode").maybeSingle(),
    admin.from("orders").select("id, seller_id, status").eq("id", params.orderId).maybeSingle(),
    admin.from("commissions").select("seller_proceeds_kobo").eq("order_id", params.orderId).maybeSingle(),
    admin.from("seller_settlements").select("id, status, provider_reference").eq("order_id", params.orderId).maybeSingle(),
  ]);

  if (!order || !comm) {
    return { ok: false, status: "failed", message: "Order or commission record not found." };
  }
  if (order.status !== "completed") {
    return { ok: false, status: "failed", message: `Order must be completed before settlement (current: ${order.status}).` };
  }
  if (existing?.status === "settled" || existing?.status === "processing") {
    return {
      ok: true,
      status: existing.status,
      message: `Settlement already ${existing.status}.`,
      providerReference: existing.provider_reference ?? undefined,
    };
  }

  const mode = (String(modeRow?.value ?? "unconfigured").replace(/"/g, "") as SettlementMode) || "unconfigured";

  const upsertSettlement = async (fields: {
    status: "pending_provider" | "processing" | "settled" | "failed";
    provider_reference?: string | null;
    failure_reason?: string | null;
    settled_at?: string | null;
  }) => {
    await admin.from("seller_settlements").upsert(
      {
        order_id: order.id,
        seller_id: order.seller_id,
        amount_kobo: comm.seller_proceeds_kobo,
        provider: mode,
        initiated_by: params.actorId,
        ...fields,
      },
      { onConflict: "order_id" },
    );
  };

  if (mode === "unconfigured") {
    await upsertSettlement({
      status: "pending_provider",
      failure_reason: "Settlement partner / Paystack payout mode is not configured.",
    });
    return {
      ok: false,
      status: "pending_provider",
      message: "Settlement recorded as pending_provider: configure a supported settlement_mode in Platform Settings.",
    };
  }

  if (!isConfigured("PAYSTACK_SECRET_KEY")) {
    await upsertSettlement({ status: "pending_provider", failure_reason: "PAYSTACK_SECRET_KEY is missing." });
    return { ok: false, status: "pending_provider", message: "PAYSTACK_SECRET_KEY is not configured." };
  }

  if (mode === "paystack_split_manual") {
    await upsertSettlement({
      status: "pending_provider",
      failure_reason: "Manual subaccount settlement release requires Paystack account-specific manual payout configuration.",
    });
    return {
      ok: false,
      status: "pending_provider",
      message: "paystack_split_manual requires Paystack support to enable manual subaccount payouts on your merchant account.",
    };
  }

  // mode === "paystack_transfer"
  const { data: bank } = await admin
    .from("seller_bank_accounts")
    .select("id, bank_code, account_number, account_name, paystack_recipient_code")
    .eq("user_id", order.seller_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bank || !bank.bank_code) {
    await upsertSettlement({
      status: "failed",
      failure_reason: "Seller bank_code is missing; cannot create Paystack transfer recipient.",
    });
    return {
      ok: false,
      status: "failed",
      message: "Seller bank code is required for Paystack Transfers.",
    };
  }

  try {
    let recipientCode = bank.paystack_recipient_code;
    if (!recipientCode) {
      const rec = await createTransferRecipient({
        name: bank.account_name,
        accountNumber: bank.account_number,
        bankCode: bank.bank_code,
      });
      recipientCode = rec.recipient_code;
      await admin.from("seller_bank_accounts").update({ paystack_recipient_code: recipientCode }).eq("id", bank.id);
    }

    const transferRef = `CQ-SET-${order.id.slice(0, 18)}`;
    const transfer = await initiateTransfer({
      amountKobo: comm.seller_proceeds_kobo,
      recipientCode,
      reference: transferRef,
      reason: `cintiQ settlement for order ${order.id.slice(0, 8)}`,
    });

    const isDone = transfer.status === "success";
    await upsertSettlement({
      status: isDone ? "settled" : "processing",
      provider_reference: transfer.transfer_code,
      failure_reason: null,
      settled_at: isDone ? new Date().toISOString() : null,
    });
    await admin.rpc("notify", {
      _user: order.seller_id,
      _type: "settlement.update",
      _title: isDone ? "Settlement sent" : "Settlement processing",
      _body: `Payout for order #${order.id.slice(0, 8)} (${transfer.transfer_code}).`,
      _link: "/seller/finance",
    });
    await admin.rpc("write_audit", {
      _actor: params.actorId,
      _action: "settlement.initiated",
      _entity_type: "seller_settlement",
      _entity_id: order.id,
      _metadata: { transfer_code: transfer.transfer_code, status: transfer.status },
    });

    return {
      ok: true,
      status: isDone ? "settled" : "processing",
      message: `Transfer initiated (${transfer.transfer_code}).`,
      providerReference: transfer.transfer_code,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transfer failed";
    await upsertSettlement({ status: "failed", failure_reason: msg.slice(0, 300) });
    return { ok: false, status: "failed", message: msg };
  }
}
