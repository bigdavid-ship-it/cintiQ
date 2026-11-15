import { describe, expect, it } from "vitest";
import { hasAnyRole, homeForRoles, safeRedirect } from "@/lib/auth/roles";
import { loginSchema, phoneSchema, registerSchema } from "@/lib/validation/auth";

describe("role checks", () => {
  it("customer cannot satisfy admin", () => expect(hasAnyRole(["customer"], ["admin"])).toBe(false));
  it("seller cannot satisfy admin", () => expect(hasAnyRole(["customer", "seller"], ["admin"])).toBe(false));
  it("super_admin satisfies admin requirements", () => expect(hasAnyRole(["super_admin"], ["admin"])).toBe(true));
  it("empty roles satisfy nothing", () => expect(hasAnyRole([], ["customer"])).toBe(false));
  it("highest privilege decides home", () => {
    expect(homeForRoles(["customer", "seller"])).toBe("/seller");
    expect(homeForRoles(["customer", "admin"])).toBe("/admin");
    expect(homeForRoles(["customer"])).toBe("/account");
  });
});

describe("safeRedirect", () => {
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", ""])("rejects %s", (v) =>
    expect(safeRedirect(v, "/account")).toBe("/account"));
  it("accepts relative paths", () => expect(safeRedirect("/orders/1", "/account")).toBe("/orders/1"));
  it("falls back on null", () => expect(safeRedirect(null, "/x")).toBe("/x"));
});

describe("auth validation", () => {
  const ok = { fullName: "Ada Obi", email: "ADA@Example.com", password: "Str0ngPassword", confirmPassword: "Str0ngPassword" };
  it("accepts valid registration and lowercases email", () => {
    const r = registerSchema.safeParse(ok);
    expect(r.success && r.data.email).toBe("ada@example.com");
  });
  it("rejects weak password", () => expect(registerSchema.safeParse({ ...ok, password: "short", confirmPassword: "short" }).success).toBe(false));
  it("rejects mismatched confirmation", () => expect(registerSchema.safeParse({ ...ok, confirmPassword: "Different1Pass" }).success).toBe(false));
  it("rejects invalid email", () => expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false));
  it("ignores attempted role injection", () => {
    const r = registerSchema.safeParse({ ...ok, role: "super_admin" });
    expect(r.success && "role" in r.data).toBe(false);
  });
  it("normalises Nigerian phone numbers", () => {
    expect(phoneSchema.parse("0803 123 4567")).toBe("+2348031234567");
    expect(phoneSchema.safeParse("123").success).toBe(false);
  });
});
