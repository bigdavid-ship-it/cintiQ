"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormBanner, Textarea } from "@/components/ui/form-parts";
import { submitSupportTicketAction } from "@/lib/marketplace/actions";
import type { ActionState } from "@/lib/auth/actions";

export function ContactForm({ defaults }: { defaults: { name: string; email: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitSupportTicketAction, { ok: false });
  const e = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-card p-6" noValidate>
      <FormBanner state={state} />
      <Field label="Full name" name="name" defaultValue={defaults.name} required error={e("name")} />
      <Field label="Email" name="email" type="email" defaultValue={defaults.email} required error={e("email")} />
      <Field label="Subject" name="subject" required error={e("subject")} />
      <Textarea label="Message" name="message" required error={e("message")} />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Send message
      </Button>
    </form>
  );
}
