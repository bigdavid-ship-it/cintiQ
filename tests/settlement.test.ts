import { describe, expect, it } from "vitest";
import { calcCommissionKobo } from "@/lib/payments/commission";

describe("commission calculation", () => {
  it("calculates 10% commission and seller proceeds accurately in kobo", () => {
    // Product price: ₦10,000 = 1,000,000 kobo
    const res = calcCommissionKobo(1_000_000, 10, 0);
    expect(res.commissionKobo).toBe(100_000); // ₦1,000
    expect(res.sellerProceedsKobo).toBe(900_000); // ₦9,000
  });

  it("rounds half away from zero and excludes delivery fee from commission", () => {
    const res = calcCommissionKobo(10_555, 10, 50_000);
    expect(res.commissionKobo).toBe(1056);
    expect(res.sellerProceedsKobo).toBe(10_555 - 1056 + 50_000);
  });

  it("handles 0% and 50% overrides", () => {
    expect(calcCommissionKobo(100_000, 0, 0)).toEqual({ grossKobo: 100_000, commissionKobo: 0, deliveryFeeKobo: 0, sellerProceedsKobo: 100_000 });
    expect(calcCommissionKobo(100_000, 50, 0)).toEqual({ grossKobo: 100_000, commissionKobo: 50_000, deliveryFeeKobo: 0, sellerProceedsKobo: 50_000 });
  });
});
