"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileField, FormBanner, Textarea } from "@/components/ui/form-parts";
import { sellerAdvanceOrderAction, uploadDisputeEvidenceAction, verifyDeliveryOtpAction } from "@/lib/orders/actions";
import { nextSellerStatuses, type FulfilmentMethod, type OrderStatus } from "@/lib/orders/transitions";
import type { ActionState } from "@/lib/auth/actions";

const LABELS: Partial<Record<OrderStatus, string>> = {
  accepted: "Accept order",
  processing: "Mark as processing",
  ready_for_delivery: "Mark ready for delivery / collection",
  out_for_delivery: "Mark out for delivery",
  delivered: "Mark as delivered",
};

function AdvanceButton({ orderId, target }: { orderId: string; target: OrderStatus }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sellerAdvanceOrderAction.bind(null, orderId, target),
    { ok: false },
  );

  return (
    <form action={action} className="space-y-3 rounded-md border border-border bg-card p-4">
      <FormBanner state={state} />
      {target === "delivered" && (
        <>
          <Textarea label="Delivery / handover note (optional)" name="note" />
          <FileField
            label="Delivery evidence (optional photo or receipt)"
            name="evidence"
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
        </>
      )}
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {LABELS[target] ?? target.replace(/_/g, " ")}
      </Button>
    </form>
  );
}

export function SellerOrderControls({
  orderId,
  status,
  method,
  disputeId,
}: {
  orderId: string;
  status: OrderStatus;
  method: FulfilmentMethod;
  disputeId?: string | null;
}) {
  const nexts = nextSellerStatuses(status, method);
  const [rejectState, rejectAction, rejectPending] = useActionState<ActionState, FormData>(
    sellerAdvanceOrderAction.bind(null, orderId, "rejected"),
    { ok: false },
  );
  const [otpState, otpAction, otpPending] = useActionState<ActionState, FormData>(
    verifyDeliveryOtpAction.bind(null, orderId),
    { ok: false },
  );
  const [evState, evAction, evPending] = useActionState<ActionState, FormData>(
    disputeId ? uploadDisputeEvidenceAction.bind(null, disputeId) : async () => ({ ok: false }),
    { ok: false },
  );

  return (
    <div className="space-y-4">
      {nexts.filter((n) => n !== "rejected").map((target) => (
        <AdvanceButton key={target} orderId={orderId} target={target} />
      ))}

      {nexts.includes("rejected") && (
        <details className="rounded-md border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-danger">Reject order</summary>
          <form action={rejectAction} className="mt-3 space-y-3">
            <FormBanner state={rejectState} />
            <Textarea label="Rejection reason (shown to customer)" name="note" required minLength={5} />
            <Button type="submit" variant="danger" disabled={rejectPending}>
              {rejectPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Reject order
            </Button>
          </form>
        </details>
      )}

      {(status === "ready_for_delivery" || status === "out_for_delivery" || status === "delivered") && (
        <form action={otpAction} className="space-y-3 rounded-md border border-border bg-brand-soft/40 p-4">
          <h3 className="font-display text-base font-semibold">Confirm handover with customer OTP</h3>
          <p className="text-xs text-muted-foreground">
            Ask the customer for their 6-digit delivery code and enter it here to complete the order.
          </p>
          <FormBanner state={otpState} />
          <div className="flex flex-wrap items-end gap-2">
            <Field label="6-digit OTP" name="otp" inputMode="numeric" maxLength={6} required />
            <Button type="submit" disabled={otpPending}>
              {otpPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Verify &amp; complete
            </Button>
          </div>
        </form>
      )}

      {status === "disputed" && disputeId && (
        <form action={evAction} className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-display text-base font-semibold">Respond to customer dispute</h3>
          <FormBanner state={evState} />
          <FileField label="Upload evidence (proof of delivery, chat, receipt)" name="evidence" accept="image/jpeg,image/png,image/webp,application/pdf" />
          <Field label="Response note" name="note" />
          <Button type="submit" variant="outline" disabled={evPending}>
            {evPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Submit evidence
          </Button>
        </form>
      )}
    </div>
  );
}
