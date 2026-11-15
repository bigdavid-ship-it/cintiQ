import { describe, expect, it } from "vitest";
import { canCustomerCancel, canOpenDispute, canRequestOtp, nextSellerStatuses } from "@/lib/orders/transitions";

describe("order fulfilment state machine", () => {
  it("allows seller to accept or reject newly notified orders", () => {
    expect(nextSellerStatuses("seller_notified", "delivery")).toEqual(["accepted", "rejected"]);
    expect(nextSellerStatuses("seller_notified", "collection")).toEqual(["accepted", "rejected"]);
  });

  it("handles delivery vs collection transitions after ready_for_delivery", () => {
    expect(nextSellerStatuses("ready_for_delivery", "delivery")).toEqual(["out_for_delivery"]);
    expect(nextSellerStatuses("out_for_delivery", "delivery")).toEqual(["delivered"]);
    expect(nextSellerStatuses("ready_for_delivery", "collection")).toEqual(["delivered"]);
  });

  it("prevents seller transitions on disputed, completed, or unpaid orders", () => {
    expect(nextSellerStatuses("pending_payment", "delivery")).toEqual([]);
    expect(nextSellerStatuses("disputed", "delivery")).toEqual([]);
    expect(nextSellerStatuses("completed", "delivery")).toEqual([]);
    expect(nextSellerStatuses("refund_pending", "delivery")).toEqual([]);
  });

  it("allows customer cancellation only before seller acceptance", () => {
    expect(canCustomerCancel("payment_confirmed")).toBe(true);
    expect(canCustomerCancel("seller_notified")).toBe(true);
    expect(canCustomerCancel("accepted")).toBe(false);
    expect(canCustomerCancel("delivered")).toBe(false);
  });

  it("allows OTP generation only during handover/delivery", () => {
    expect(canRequestOtp("accepted")).toBe(false);
    expect(canRequestOtp("ready_for_delivery")).toBe(true);
    expect(canRequestOtp("out_for_delivery")).toBe(true);
    expect(canRequestOtp("delivered")).toBe(true);
    expect(canRequestOtp("completed")).toBe(false);
  });

  it("allows disputes only on active/delivered fulfilment stages", () => {
    expect(canOpenDispute("pending_payment")).toBe(false);
    expect(canOpenDispute("accepted")).toBe(true);
    expect(canOpenDispute("delivered")).toBe(true);
    expect(canOpenDispute("completed")).toBe(false);
    expect(canOpenDispute("disputed")).toBe(false);
  });
});
