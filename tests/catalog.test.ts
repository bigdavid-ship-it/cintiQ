import { describe, expect, it } from "vitest";
import { koboToNairaString, nairaToKobo } from "@/lib/money";
import { sniffMime, validateUpload } from "@/lib/uploads";
import { productSchema } from "@/lib/validation/product";
import { parseApplicationForm } from "@/lib/validation/seller";
import { availability } from "@/lib/types";

describe("money", () => {
  it.each([["2500", 250000], ["2,500.50", 250050], ["0.99", 99], ["10000", 1000000], ["1.5", 150]])("parses %s", (i, k) => expect(nairaToKobo(i)).toBe(k));
  it.each(["", "abc", "-5", "0", "1.234", "1e5", "1000000000", "12.", "NaN"])("rejects %s", (i) => expect(nairaToKobo(i)).toBeNull());
  it("round-trips", () => expect(koboToNairaString(250050)).toBe("2500.50"));
  it("has no float drift (0.1 + 0.2 style)", () => expect(nairaToKobo("0.29")).toBe(29));
});

describe("uploads", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  it("detects real types from bytes", () => {
    expect(sniffMime(png)).toBe("image/png");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
  });
  it("rejects a script renamed to .png / claiming image/png", async () => {
    const f = new File(["<script>alert(1)</script>"], "x.png", { type: "image/png" });
    expect((await validateUpload(f, "image")).ok).toBe(false);
  });
  it("rejects PDF as product image but allows as document", async () => {
    const f = new File([new TextEncoder().encode("%PDF-1.7 body")], "a.pdf", { type: "application/pdf" });
    expect((await validateUpload(f, "image")).ok).toBe(false);
    expect((await validateUpload(f, "document")).ok).toBe(true);
  });
  it("rejects empty and oversized files", async () => {
    expect((await validateUpload(new File([], "e.png"), "image")).ok).toBe(false);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "b.png");
    expect((await validateUpload(big, "image")).ok).toBe(false);
  });
});

describe("product validation", () => {
  const base = { name: "Jollof rice", description: "", price: "1500", quantity: "10", categoryId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", status: "active" };
  it("converts naira to kobo", () => {
    const r = productSchema.safeParse(base);
    expect(r.success && r.data.price).toBe(150000);
  });
  it("rejects negative / fractional stock and bad price", () => {
    expect(productSchema.safeParse({ ...base, quantity: "-1" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, quantity: "1.5" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, price: "free" }).success).toBe(false);
  });
  it("seller cannot choose suspended status or feature a product", () => {
    expect(productSchema.safeParse({ ...base, status: "suspended" }).success).toBe(false);
    const r = productSchema.safeParse({ ...base, is_featured: "true" });
    expect(r.success && "is_featured" in r.data).toBe(false);
  });
});

describe("seller application validation", () => {
  const fd = (o: Record<string, string>, cats = ["3f2504e0-4f89-41d3-9a0c-0305e82c3301"]) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    cats.forEach((c) => f.append("categoryIds", c));
    return f;
  };
  const base = { sellerType: "student", fullName: "Ada Obi", businessName: "Ada Snacks", phone: "08031234567", email: "ada@example.com", studentIdNumber: "18/0001", businessLocation: "Block C, Hostel 2", description: "Home-made snacks and drinks for students.", bankName: "GTBank", accountNumber: "0123456789", accountName: "Ada Obi" };
  it("accepts a valid student application", () => expect(parseApplicationForm(fd(base)).success).toBe(true));
  it("requires student ID for students", () => expect(parseApplicationForm(fd({ ...base, studentIdNumber: "" })).success).toBe(false));
  it("requires 10-digit account number", () => expect(parseApplicationForm(fd({ ...base, accountNumber: "12345" })).success).toBe(false));
  it("requires at least one category", () => expect(parseApplicationForm(fd(base, [])).success).toBe(false));
  it("does not let applicants set their own status", () => {
    const r = parseApplicationForm(fd({ ...base, status: "approved" }));
    expect(r.success && "status" in r.data).toBe(false);
  });
});

describe("availability", () => {
  it("derives from status and quantity", () => {
    expect(availability({ status: "active", quantity: 10 })).toBe("in_stock");
    expect(availability({ status: "active", quantity: 3 })).toBe("low_stock");
    expect(availability({ status: "active", quantity: 0 })).toBe("out_of_stock");
    expect(availability({ status: "draft", quantity: 10 })).toBe("unavailable");
  });
});
