"use server";

import { revalidatePath } from "next/cache";
import { requireActiveSeller } from "@/lib/auth/session";
import { isConfigured } from "@/lib/env";
import { audit } from "@/lib/audit";
import { resolveBankAccount } from "@/lib/payments/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/auth/actions";

export type BankVerifyState = ActionState & {
  verifiedName?: string;
  verifiedBankCode?: string;
  verifiedAccountNumber?: string;
};

function parseBankInput(fd: FormData) {
  const bankCode = String(fd.get("bankCode") ?? "").trim();
  const bankName = String(fd.get("bankName") ?? "").trim();
  const accountNumber = String(fd.get("accountNumber") ?? "").replace(/\s+/g, "");

  const fieldErrors: Record<string, string[]> = {};
  if (!/^[0-9]{3,6}$/.test(bankCode)) fieldErrors.bankCode = ["Select a valid bank."];
  if (bankName.length < 2 || bankName.length > 80) fieldErrors.bankCode = ["Select a valid bank."];
  if (!/^[0-9]{10}$/.test(accountNumber)) fieldErrors.accountNumber = ["Enter a valid 10-digit account number."];

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false as const, fieldErrors };
  }
  return { ok: true as const, bankCode, bankName, accountNumber };
}

export async function verifySellerBankAction(_: BankVerifyState, fd: FormData): Promise<BankVerifyState> {
  await requireActiveSeller("/seller/finance");
  if (!isConfigured("PAYSTACK_SECRET_KEY")) {
    return { ok: false, message: "Paystack verification is not configured on the server." };
  }

  const parsed = parseBankInput(fd);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  try {
    const resolved = await resolveBankAccount({
      accountNumber: parsed.accountNumber,
      bankCode: parsed.bankCode,
    });
    return {
      ok: true,
      message: `Account verified: ${resolved.account_name}`,
      verifiedName: resolved.account_name,
      verifiedBankCode: parsed.bankCode,
      verifiedAccountNumber: parsed.accountNumber,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not verify bank account with Paystack.",
    };
  }
}

export async function updateSellerBankAction(_: BankVerifyState, fd: FormData): Promise<BankVerifyState> {
  const seller = await requireActiveSeller("/seller/finance");
  if (!isConfigured("PAYSTACK_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")) {
    return { ok: false, message: "Paystack verification is not configured on the server." };
  }

  const parsed = parseBankInput(fd);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  let verifiedName: string;
  try {
    const resolved = await resolveBankAccount({
      accountNumber: parsed.accountNumber,
      bankCode: parsed.bankCode,
    });
    verifiedName = resolved.account_name;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not verify account details with Paystack.",
    };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("seller_bank_accounts")
    .select("id")
    .eq("user_id", seller.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("seller_bank_accounts")
      .update({
        bank_name: parsed.bankName,
        bank_code: parsed.bankCode,
        account_number: parsed.accountNumber,
        account_name: verifiedName,
        is_verified: true,
        paystack_recipient_code: null,
      })
      .eq("id", existing.id);

    if (error) return { ok: false, message: "Could not save your updated bank account." };
  } else {
    const { data: app } = await admin
      .from("seller_applications")
      .select("id")
      .eq("user_id", seller.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!app) {
      return { ok: false, message: "No seller application record found for this account." };
    }

    const { error } = await admin.from("seller_bank_accounts").insert({
      user_id: seller.id,
      application_id: app.id,
      bank_name: parsed.bankName,
      bank_code: parsed.bankCode,
      account_number: parsed.accountNumber,
      account_name: verifiedName,
      is_verified: true,
      paystack_recipient_code: null,
    });

    if (error) return { ok: false, message: "Could not save your bank account." };
  }

  await audit(seller.id, "seller.bank_account.update", "seller_bank_account", seller.id, {
    bank_code: parsed.bankCode,
    bank_name: parsed.bankName,
    account_last4: parsed.accountNumber.slice(-4),
    verified_name: verifiedName,
  });

  revalidatePath("/seller/finance");
  revalidatePath("/admin/settlements");
  return {
    ok: true,
    message: `Payout account updated & verified as ${verifiedName}.`,
    verifiedName,
    verifiedBankCode: parsed.bankCode,
    verifiedAccountNumber: parsed.accountNumber,
  };
}
