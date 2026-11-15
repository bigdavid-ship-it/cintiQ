"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormBanner, Select, Textarea } from "@/components/ui/form-parts";
import { startCheckoutAction } from "@/lib/checkout/actions";
import { formatKobo } from "@/lib/utils";
import type { ActionState } from "@/lib/auth/actions";

type SavedAddress = { id: string; label: string; recipient_name: string; phone: string; address: string };

export function CheckoutForm({
  idempotencyKey,
  addresses,
  defaults,
  subtotalKobo,
  deliveryFeeEachKobo,
  sellerCount,
  paystackConfigured,
}: {
  idempotencyKey: string;
  addresses: SavedAddress[];
  defaults: { name: string; phone: string };
  subtotalKobo: number;
  deliveryFeeEachKobo: number;
  sellerCount: number;
  paystackConfigured: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startCheckoutAction, { ok: false });
  const [method, setMethod] = useState<"delivery" | "collection">("delivery");
  const [name, setName] = useState(addresses[0]?.recipient_name ?? defaults.name);
  const [phone, setPhone] = useState(addresses[0]?.phone ?? defaults.phone);
  const [address, setAddress] = useState(addresses[0]?.address ?? "");
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cintiq_checkout_draft");
      if (raw) {
        const d = JSON.parse(raw) as Partial<{ method: "delivery" | "collection"; name: string; phone: string; address: string; notes: string }>;
        if (d.method === "delivery" || d.method === "collection") setMethod(d.method);
        if (d.name) setName(d.name);
        if (d.phone) setPhone(d.phone);
        if (d.address) setAddress(d.address);
        if (d.notes) setNotes(d.notes);
      }
    } catch {
      // Ignore storage errors
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem("cintiq_checkout_draft", JSON.stringify({ method, name, phone, address, notes }));
    } catch {
      // Ignore storage errors
    }
  }, [hydrated, method, name, phone, address, notes]);

  const e = (k: string) => state.fieldErrors?.[k]?.[0];
  const deliveryFeeTotal = method === "delivery" ? deliveryFeeEachKobo * sellerCount : 0;
  const total = subtotalKobo + deliveryFeeTotal;

  const pickAddress = (id: string) => {
    const found = addresses.find((a) => a.id === id);
    if (!found) return;
    setName(found.recipient_name);
    setPhone(found.phone);
    setAddress(found.address);
  };

  return (
    <form
      action={action}
      onSubmit={() => {
        try {
          sessionStorage.removeItem("cintiq_checkout_draft");
        } catch {
          // Ignore storage errors
        }
      }}
      className="space-y-6"
      noValidate
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {!paystackConfigured && (
        <p role="alert" className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Paystack is not configured (`PAYSTACK_SECRET_KEY` missing). You can review your order summary, but payment cannot be initialized yet.
        </p>
      )}
      <FormBanner state={state} />

      <Select
        label="Fulfilment method"
        name="fulfilmentMethod"
        value={method}
        onChange={(ev) => setMethod(ev.target.value as "delivery" | "collection")}
      >
        <option value="delivery">Seller delivery to campus address</option>
        <option value="collection">In-person collection from seller</option>
      </Select>

      {addresses.length > 0 && method === "delivery" && (
        <div className="space-y-1.5">
          <label htmlFor="saved-addr" className="text-sm font-medium">Use a saved address</label>
          <select
            id="saved-addr"
            onChange={(ev) => pickAddress(ev.target.value)}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            defaultValue={addresses[0].id}
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} — {a.address}
              </option>
            ))}
          </select>
        </div>
      )}

      <Field
        label="Recipient name"
        name="recipientName"
        value={name}
        onChange={(ev) => setName(ev.target.value)}
        required
        error={e("recipientName")}
      />
      <Field
        label="Phone number"
        name="recipientPhone"
        type="tel"
        value={phone}
        onChange={(ev) => setPhone(ev.target.value)}
        placeholder="0803 000 0000"
        required
        error={e("recipientPhone")}
      />
      <Textarea
        label={method === "delivery" ? "Delivery address (hostel / faculty / landmark)" : "Preferred collection point / note"}
        name="deliveryAddress"
        value={address}
        onChange={(ev) => setAddress(ev.target.value)}
        required
        error={e("deliveryAddress")}
      />
      <Textarea
        label="Order notes (optional)"
        name="notes"
        value={notes}
        onChange={(ev) => setNotes(ev.target.value)}
      />

      {method === "delivery" && (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="saveAddress" className="size-4" /> Save this delivery address for next time
          </label>
          <Field label="Address label (optional, e.g. Hostel)" name="addressLabel" />
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatKobo(subtotalKobo)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery charges</dt>
            <dd>{deliveryFeeTotal === 0 ? "₦0.00" : formatKobo(deliveryFeeTotal)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total payable</dt>
            <dd className="font-display">{formatKobo(total)}</dd>
          </div>
        </dl>
      </div>

      <Button type="submit" disabled={pending || !paystackConfigured} className="w-full">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Pay {formatKobo(total)} with Paystack
      </Button>
    </form>
  );
}
