"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConfigured } from "@/lib/env";
import { checkoutSchema } from "@/lib/validation/checkout";
import { initializeTransaction } from "@/lib/payments/paystack";
import { reconcilePaystackReference } from "@/lib/payments/service";
import type { ActionState } from "@/lib/auth/actions";

export async function startCheckoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/checkout");

  if (!isConfigured("PAYSTACK_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")) {
    return {
      ok: false,
      message: "Payment gateway (Paystack) is not configured yet. Checkout cannot process payments until PAYSTACK_SECRET_KEY is set.",
    };
  }

  const parsed = checkoutSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const supabase = await createClient();

  // Optionally save delivery address for future checkouts
  if (d.saveAddress === "on" && d.fulfilmentMethod === "delivery") {
    await supabase.from("delivery_addresses").insert({
      user_id: user.id,
      label: d.addressLabel?.trim() || "Saved address",
      recipient_name: d.recipientName,
      phone: d.recipientPhone,
      address: d.deliveryAddress,
    });
  }

  const { data: created, error: rpcErr } = await supabase.rpc("create_checkout", {
    _key: d.idempotencyKey,
    _method: d.fulfilmentMethod,
    _name: d.recipientName,
    _phone: d.recipientPhone,
    _address: d.deliveryAddress,
    _notes: d.notes ?? null,
  });

  if (rpcErr || !created) {
    return { ok: false, message: rpcErr?.message ?? "Could not create checkout. Please review your cart." };
  }

  const checkout = created as { checkout_id: string; reference: string; total_kobo: number; reused: boolean };
  const admin = createAdminClient();

  // If this idempotency key already initialized Paystack, check if it was already paid before reusing URL
  if (checkout.reused) {
    try {
      const check = await reconcilePaystackReference(checkout.reference);
      if (check.status === "confirmed" || check.status === "already_processed") {
        redirect(`/checkout/callback?reference=${encodeURIComponent(checkout.reference)}`);
      }
    } catch {
      // Ignore transient verify error and fall back to existing authorization URL
    }

    const { data: existingPay } = await admin
      .from("payments")
      .select("authorization_url")
      .eq("checkout_id", checkout.checkout_id)
      .maybeSingle();
    if (existingPay?.authorization_url) {
      redirect(existingPay.authorization_url);
    }
  }

  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const rawOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    h.get("origin") ||
    (forwardedHost ? `https://${forwardedHost}` : "http://localhost:3000");
  const origin = rawOrigin.replace(/\/+$/, "");

  let authUrl: string;
  try {
    const init = await initializeTransaction({
      email: user.email,
      amountKobo: checkout.total_kobo,
      reference: checkout.reference,
      callbackUrl: `${origin}/checkout/callback`,
      metadata: { checkout_id: checkout.checkout_id, user_id: user.id },
    });
    await admin
      .from("payments")
      .update({ authorization_url: init.authorization_url, access_code: init.access_code })
      .eq("checkout_id", checkout.checkout_id);
    authUrl = init.authorization_url;
  } catch (err) {
    // Release reserved stock if Paystack initialization failed
    await admin.rpc("release_checkout", { _id: checkout.checkout_id, _status: "failed" });
    return {
      ok: false,
      message: err instanceof Error ? `Payment initialization failed: ${err.message}` : "Could not initialize payment.",
    };
  }

  revalidatePath("/cart");
  revalidatePath("/orders");
  redirect(authUrl);
}

export async function cancelCheckoutAction(checkoutId: string) {
  await requireRole(["customer", "seller", "admin", "super_admin"], "/orders");
  const supabase = await createClient();
  await supabase.rpc("cancel_checkout", { _id: checkoutId });
  revalidatePath("/orders");
  revalidatePath("/cart");
  redirect(`/orders/${checkoutId}`);
}
