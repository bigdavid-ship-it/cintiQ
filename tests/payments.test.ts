import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "@/lib/payments/paystack";
import { addressSchema, cartAddSchema, checkoutSchema } from "@/lib/validation/checkout";

describe("paystack webhook signature", () => {
  const secret = "sk_test_1234567890abcdef";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "CQ-123", amount: 50000 } });
  const sig = createHmac("sha512", secret).update(body).digest("hex");

  it("accepts a valid HMAC-SHA512 signature", () => {
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, sig.toUpperCase(), secret)).toBe(true);
  });

  it("rejects tampered body, wrong secret, or missing signature", () => {
    expect(verifyWebhookSignature(body + " ", sig, secret)).toBe(false);
    expect(verifyWebhookSignature(body, sig, "sk_test_wrong")).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "short", secret)).toBe(false);
  });
});

describe("cart & checkout validation", () => {
  const pid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

  it("validates cart additions", () => {
    expect(cartAddSchema.safeParse({ productId: pid, quantity: "2" }).success).toBe(true);
    expect(cartAddSchema.safeParse({ productId: pid, quantity: "0" }).success).toBe(false);
    expect(cartAddSchema.safeParse({ productId: pid, quantity: "100" }).success).toBe(false);
    expect(cartAddSchema.safeParse({ productId: "not-a-uuid", quantity: "1" }).success).toBe(false);
  });

  it("normalises phone in delivery address", () => {
    const r = addressSchema.safeParse({
      label: "Hostel",
      recipientName: "Chidi Eze",
      phone: "0803 123 4567",
      address: "Room 204, Moremi Hall",
    });
    expect(r.success && r.data.phone).toBe("+2348031234567");
  });

  it("validates checkout form and ignores total tampering", () => {
    const r = checkoutSchema.safeParse({
      idempotencyKey: "12345678-abcd",
      fulfilmentMethod: "delivery",
      recipientName: "Chidi Eze",
      recipientPhone: "08031234567",
      deliveryAddress: "Room 204, Moremi Hall",
      total_kobo: "1",
    });
    expect(r.success).toBe(true);
    expect(r.success && "total_kobo" in r.data).toBe(false);
  });
});
