"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileField, FormBanner, Select, Textarea } from "@/components/ui/form-parts";
import { submitApplicationAction } from "@/lib/sellers/actions";
import type { ActionState } from "@/lib/auth/actions";

export function ApplicationForm({ categories, defaults }: { categories: { id: string; name: string }[]; defaults: { fullName: string; email: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitApplicationAction, { ok: false });
  const [type, setType] = useState<"student" | "business">("student");
  const e = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={action} className="space-y-8" noValidate>
      <FormBanner state={state} />
      <fieldset className="space-y-4">
        <legend className="font-display mb-2 text-lg font-semibold">About you</legend>
        <Select label="I am a" name="sellerType" value={type} onChange={(ev) => setType(ev.target.value as "student" | "business")}>
          <option value="student">Student entrepreneur</option>
          <option value="business">Physical business / trader</option>
        </Select>
        <Field label="Full name" name="fullName" defaultValue={defaults.fullName} required error={e("fullName")} />
        <Field label="Store / business name" name="businessName" required error={e("businessName")} />
        <Field label="Phone number" name="phone" type="tel" placeholder="0803 000 0000" required error={e("phone")} />
        <Field label="Contact email" name="email" type="email" defaultValue={defaults.email} required error={e("email")} />
        {type === "student" ? (
          <>
            <Field label="Student ID / matric number" name="studentIdNumber" required error={e("studentIdNumber")} />
            <Field label="Institution" name="institution" error={e("institution")} />
          </>
        ) : (
          <Field label="CAC / business registration number (if any)" name="businessRegistrationNumber" error={e("businessRegistrationNumber")} />
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display mb-2 text-lg font-semibold">Your store</legend>
        <Field label="Business location" name="businessLocation" placeholder="Hostel / shop address near campus" required error={e("businessLocation")} />
        <Textarea label="What do you sell?" name="description" required error={e("description")} />
        <div role="group" aria-labelledby="cats-label" className="space-y-2">
          <p id="cats-label" className="text-sm font-medium">Product categories</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="categoryIds" value={c.id} className="size-4" /> {c.name}
              </label>
            ))}
          </div>
          {e("categoryIds") && <p role="alert" className="text-xs text-danger">{e("categoryIds")}</p>}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display mb-2 text-lg font-semibold">Verification documents</legend>
        <p className="text-sm text-muted-foreground">JPEG, PNG, WebP or PDF, up to 8MB. Documents are private and only visible to you and cintiQ administrators.</p>
        {type === "student" ? (
          <FileField label="Student ID card" name="student_id" accept="image/jpeg,image/png,image/webp,application/pdf" error={e("student_id")} />
        ) : (
          <>
            <FileField label="Business registration certificate" name="business_registration" accept="image/jpeg,image/png,image/webp,application/pdf" error={e("business_registration")} />
            <FileField label="Government-issued ID" name="government_id" accept="image/jpeg,image/png,image/webp,application/pdf" />
            <FileField label="Proof of address (optional)" name="proof_of_address" accept="image/jpeg,image/png,image/webp,application/pdf" />
          </>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display mb-2 text-lg font-semibold">Settlement bank account</legend>
        <p className="text-sm text-muted-foreground">Used only to pay your sale proceeds. Never shown publicly. The account name should match your registered name.</p>
        <Field label="Bank name" name="bankName" required error={e("bankName")} />
        <Field label="Account number (10 digits)" name="accountNumber" inputMode="numeric" maxLength={10} required error={e("accountNumber")} />
        <Field label="Account name" name="accountName" required error={e("accountName")} />
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Submit application
      </Button>
    </form>
  );
}
