"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileField, FormBanner, Select, Textarea } from "@/components/ui/form-parts";
import {
  customerCancelOrderAction,
  openDisputeAction,
  requestDeliveryOtpAction,
  submitReviewAction,
  uploadDisputeEvidenceAction,
  verifyDeliveryOtpAction,
  type OtpState,
} from "@/lib/orders/actions";
import { canCustomerCancel, canOpenDispute, canRequestOtp, type OrderStatus } from "@/lib/orders/transitions";
import type { ActionState } from "@/lib/auth/actions";

export function CustomerOrderControls({
  orderId,
  sellerId,
  status,
  disputeId,
  hasReview,
}: {
  orderId: string;
  sellerId: string;
  status: OrderStatus;
  disputeId?: string | null;
  hasReview?: boolean;
}) {
  const [otpState, setOtpState] = useState<OtpState | null>(null);
  const [otpPending, startOtp] = useTransition();

  const [cancelState, cancelAction, cancelPending] = useActionState<ActionState, FormData>(
    customerCancelOrderAction.bind(null, orderId),
    { ok: false },
  );
  const [verifyState, verifyAction, verifyPending] = useActionState<ActionState, FormData>(
    verifyDeliveryOtpAction.bind(null, orderId),
    { ok: false },
  );
  const [disputeState, disputeAction, disputePending] = useActionState<ActionState, FormData>(
    openDisputeAction.bind(null, orderId),
    { ok: false },
  );
  const [evState, evAction, evPending] = useActionState<ActionState, FormData>(
    disputeId ? uploadDisputeEvidenceAction.bind(null, disputeId) : async () => ({ ok: false }),
    { ok: false },
  );
  const [revState, revAction, revPending] = useActionState<ActionState, FormData>(
    submitReviewAction.bind(null, orderId, sellerId),
    { ok: false },
  );

  return (
    <div className="space-y-4 border-t border-border p-4 text-sm">
      {canCustomerCancel(status) && (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer font-medium text-danger">Cancel order</summary>
          <form action={cancelAction} className="mt-3 space-y-2">
            <FormBanner state={cancelState} />
            <Field label="Reason for cancellation" name="reason" required minLength={3} />
            <Button type="submit" variant="danger" disabled={cancelPending}>
              {cancelPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirm cancellation
            </Button>
          </form>
        </details>
      )}

      {canRequestOtp(status) && (
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">Delivery confirmation code (OTP)</p>
              <p className="text-xs text-muted-foreground">
                Share this 6-digit code with the seller at handover, or enter it below once you inspect your items.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={otpPending}
              onClick={() => startOtp(async () => setOtpState(await requestDeliveryOtpAction(orderId)))}
            >
              {otpPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {otpState?.otp ? "Regenerate OTP" : "Generate delivery OTP"}
            </Button>
          </div>
          {otpState?.message && <p role="alert" className="text-xs text-danger">{otpState.message}</p>}
          {otpState?.otp && (
            <div className="rounded-md border border-brand/30 bg-brand-soft p-3">
              <p className="text-xs text-muted-foreground">Your one-time delivery code:</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-brand">{otpState.otp}</p>
              {otpState.expiresAt && (
                <p className="text-xs text-muted-foreground">Expires {new Date(otpState.expiresAt).toLocaleString("en-NG")}</p>
              )}
            </div>
          )}
          {status === "delivered" && (
            <form action={verifyAction} className="flex flex-wrap items-end gap-2 pt-1">
              <FormBanner state={verifyState} />
              <Field label="Enter 6-digit OTP to confirm receipt" name="otp" inputMode="numeric" maxLength={6} required />
              <Button type="submit" disabled={verifyPending}>
                {verifyPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirm receipt
              </Button>
            </form>
          )}
        </div>
      )}

      {canOpenDispute(status) && (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer font-medium">Report a problem / open dispute</summary>
          <form action={disputeAction} className="mt-3 space-y-3">
            <FormBanner state={disputeState} />
            <Select label="Problem type" name="reason" required>
              <option value="non_delivery">Non-delivery</option>
              <option value="wrong_product">Wrong product</option>
              <option value="damaged_product">Damaged product</option>
              <option value="missing_items">Missing items</option>
              <option value="other">Other fulfilment problem</option>
            </Select>
            <Textarea label="Describe the issue" name="description" required minLength={10} error={disputeState.fieldErrors?.description?.[0]} />
            <FileField label="Supporting evidence (optional, up to 3 files)" name="evidence" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
            <Button type="submit" variant="danger" disabled={disputePending}>
              {disputePending && <Loader2 className="size-4 animate-spin" aria-hidden />} Submit dispute
            </Button>
          </form>
        </details>
      )}

      {status === "disputed" && disputeId && (
        <form action={evAction} className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="font-medium">Order is under dispute</p>
          <FormBanner state={evState} />
          <FileField label="Upload additional evidence" name="evidence" accept="image/jpeg,image/png,image/webp,application/pdf" />
          <Field label="Note (optional)" name="note" />
          <Button type="submit" variant="outline" disabled={evPending}>
            {evPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Upload evidence
          </Button>
        </form>
      )}

      {(status === "customer_confirmed" || status === "completed") && !hasReview && (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer font-medium text-brand">Leave a review</summary>
          <form action={revAction} className="mt-3 space-y-3">
            <FormBanner state={revState} />
            <Select label="Rating" name="rating" defaultValue="5">
              <option value="5">5 — Excellent</option>
              <option value="4">4 — Good</option>
              <option value="3">3 — Average</option>
              <option value="2">2 — Poor</option>
              <option value="1">1 — Very poor</option>
            </Select>
            <Textarea label="Comment (optional)" name="comment" />
            <Button type="submit" disabled={revPending}>
              {revPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Submit review
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
