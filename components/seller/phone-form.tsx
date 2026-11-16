"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormBanner } from "@/components/ui/form-parts";
import { updateSellerPhoneAction } from "@/lib/seller/profile-actions";
import type { ActionState } from "@/lib/auth/actions";

const INITIAL: ActionState = { ok: false };

export function PhoneNumberForm({ currentPhone }: { currentPhone: string }) {
  const [state, action, pending] = useActionState(updateSellerPhoneAction, INITIAL);
  const e = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={action} className="mt-4 space-y-3">
      <FormBanner state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="Phone number (for order call alerts & support)"
            name="phone"
            type="tel"
            defaultValue={currentPhone}
            placeholder="08031234567 or +2348031234567"
            required
            error={e("phone")}
          />
        </div>
        <Button type="submit" disabled={pending} className="sm:mb-0.5">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Save phone
        </Button>
      </div>
    </form>
  );
}
