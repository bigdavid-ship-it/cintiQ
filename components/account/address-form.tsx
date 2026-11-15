"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormBanner, Textarea } from "@/components/ui/form-parts";
import { saveAddressAction } from "@/lib/cart/actions";
import type { ActionState } from "@/lib/auth/actions";

export function AddressForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveAddressAction, { ok: false });
  const e = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-card p-4" noValidate>
      <h3 className="font-display text-base font-semibold">Add delivery address</h3>
      <FormBanner state={state} />
      <Field label="Label (e.g. Hostel, Dept)" name="label" required error={e("label")} />
      <Field label="Recipient name" name="recipientName" required error={e("recipientName")} />
      <Field label="Phone number" name="phone" type="tel" placeholder="0803 000 0000" required error={e("phone")} />
      <Textarea label="Address" name="address" required error={e("address")} />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Save address
      </Button>
    </form>
  );
}
