export const ROLES = ["customer", "seller", "admin", "super_admin"] as const;
export type AppRole = (typeof ROLES)[number];

export function hasAnyRole(userRoles: readonly AppRole[], allowed: readonly AppRole[]): boolean {
  // super_admin implicitly satisfies any admin requirement
  if (userRoles.includes("super_admin") && allowed.includes("admin")) return true;
  return allowed.some((r) => userRoles.includes(r));
}

/** Where each role lands after sign-in. Highest privilege wins. */
export function homeForRoles(roles: readonly AppRole[]): string {
  if (roles.includes("super_admin") || roles.includes("admin")) return "/admin";
  if (roles.includes("seller")) return "/seller";
  return "/account";
}

/** Only same-origin relative paths are allowed as post-login redirects (open-redirect guard). */
export function safeRedirect(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
