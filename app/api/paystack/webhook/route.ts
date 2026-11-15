import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { isConfigured, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/payments/paystack";
import { reconcilePaystackReference } from "@/lib/payments/service";

export async function POST(request: NextRequest) {
  if (!isConfigured("PAYSTACK_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")) {
    return NextResponse.json({ error: "Payment service not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!verifyWebhookSignature(rawBody, signature, serverEnv.paystackSecretKey())) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { event?: string; data?: { id?: number | string; reference?: string; gateway_response?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = String(payload.event ?? "unknown");
  const reference = payload.data?.reference ? String(payload.data.reference) : null;
  const bodyHash = createHash("sha256").update(rawBody).digest("hex").slice(0, 16);
  const dedupeKey = `paystack:${event}:${payload.data?.id ?? reference ?? bodyHash}`;

  const admin = createAdminClient();
  const { data: logRow, error: insErr } = await admin
    .from("payment_webhooks")
    .insert({
      dedupe_key: dedupeKey,
      provider: "paystack",
      event_type: event,
      reference,
      signature_valid: true,
      payload,
      status: "received",
    })
    .select("id")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: "Webhook log error" }, { status: 500 });
  }

  try {
    if (event === "charge.success" && reference) {
      await reconcilePaystackReference(reference);
      await admin
        .from("payment_webhooks")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", logRow.id);
    } else if (event === "charge.failed" && reference) {
      await admin.rpc("fail_payment", {
        _reference: reference,
        _reason: payload.data?.gateway_response ?? "Charge failed",
      });
      await admin
        .from("payment_webhooks")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", logRow.id);
    } else {
      await admin
        .from("payment_webhooks")
        .update({ status: "ignored", processed_at: new Date().toISOString() })
        .eq("id", logRow.id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Processing error";
    await admin
      .from("payment_webhooks")
      .update({ status: "error", error: msg.slice(0, 500), processed_at: new Date().toISOString() })
      .eq("id", logRow.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
