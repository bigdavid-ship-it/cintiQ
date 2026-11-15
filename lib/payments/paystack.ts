import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

const BASE = "https://api.paystack.co";

export type PaystackInitResponse = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackVerifyResponse = {
  id: number;
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number; // kobo
  currency: string;
  channel: string | null;
  fees: number | null;
  gateway_response: string | null;
  paid_at: string | null;
};

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = serverEnv.paystackSecretKey();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !body?.status || !body.data) {
    throw new Error(body?.message ?? `Paystack API error (${res.status})`);
  }
  return body.data;
}

export async function initializeTransaction(params: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitResponse> {
  return paystackFetch<PaystackInitResponse>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      currency: "NGN",
      metadata: params.metadata,
    }),
  });
}

export async function verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
  return paystackFetch<PaystackVerifyResponse>(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });
}

export async function createTransferRecipient(params: {
  name: string;
  accountNumber: string;
  bankCode: string;
}): Promise<{ recipient_code: string }> {
  return paystackFetch<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    }),
  });
}

export async function initiateTransfer(params: {
  amountKobo: number;
  recipientCode: string;
  reference: string;
  reason: string;
}): Promise<{ transfer_code: string; status: string }> {
  return paystackFetch<{ transfer_code: string; status: string }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: params.amountKobo,
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
      currency: "NGN",
    }),
  });
}

export async function createPaystackRefund(params: {
  transactionReference: string;
  amountKobo: number;
  merchantNote?: string;
}): Promise<{ id: number; status: string }> {
  return paystackFetch<{ id: number; status: string }>("/refund", {
    method: "POST",
    body: JSON.stringify({
      transaction: params.transactionReference,
      amount: params.amountKobo,
      merchant_note: params.merchantNote,
    }),
  });
}

/** Verifies Paystack's HMAC-SHA512 x-paystack-signature header against the raw request body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secretKey: string): boolean {
  if (!signature || !secretKey) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
