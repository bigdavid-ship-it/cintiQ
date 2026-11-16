"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormBanner, Select } from "@/components/ui/form-parts";
import { updateSellerBankAction, type BankVerifyState } from "@/lib/seller/bank-actions";
import type { PaystackBank } from "@/lib/payments/paystack";

type Props = {
  banks: PaystackBank[];
  current?: {
    bank_name: string;
    bank_code: string | null;
    account_number: string;
    account_name: string;
    is_verified: boolean;
  } | null;
};

const INITIAL: BankVerifyState = { ok: false };

export function BankAccountForm({ banks, current }: Props) {
  const [selectedCode, setSelectedCode] = useState(current?.bank_code ?? "");
  const [accountNumber, setAccountNumber] = useState(current?.account_number ?? "");
  const [saveState, saveAction, saving] = useActionState(updateSellerBankAction, INITIAL);

  const selectedBankName =
    banks.find((b) => b.code === selectedCode)?.name ?? current?.bank_name ?? "";

  const activeState = saveState;
  const e = (k: string) => activeState.fieldErrors?.[k]?.[0];

  const verifiedName = saveState.ok ? saveState.verifiedName : undefined;

  return (
    <form action={saveAction} className="mt-4 space-y-4">
      <FormBanner state={activeState} />
      <input type="hidden" name="bankName" value={selectedBankName} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Bank"
          name="bankCode"
          value={selectedCode}
          onChange={(ev) => setSelectedCode(ev.target.value)}
          required
          error={e("bankCode")}
        >
          <option value="" disabled>
            {banks.length > 0 ? "Select your bank" : "Bank list unavailable"}
          </option>
          {banks.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </Select>

        <Field
          label="Account number (10 digits)"
          name="accountNumber"
          inputMode="numeric"
          maxLength={10}
          value={accountNumber}
          onChange={(ev) => setAccountNumber(ev.target.value.replace(/\D/g, "").slice(0, 10))}
          required
          error={e("accountNumber")}
        />
      </div>

      {verifiedName && (
        <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          <span>
            Verified account name: <strong>{verifiedName}</strong>
          </span>
        </div>
      )}

      <Button type="submit" disabled={saving || banks.length === 0}>
        {saving && <Loader2 className="size-4 animate-spin" aria-hidden />} Verify &amp; Save bank account
      </Button>
    </form>
  );
}
