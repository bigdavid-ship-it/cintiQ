import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasAnyRole, type AppRole } from "@/lib/auth/roles";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: AppRole[];
  isSuspended: boolean;
};

/** Verified session (getUser re-validates the JWT with Supabase Auth, never trusts cookies alone). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name,is_suspended").eq("id", auth.user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
  ]);

  return {
    id: auth.user.id,
    email: auth.user.email ?? "",
    fullName: profile?.full_name ?? "",
    roles: (roles ?? []).map((r) => r.role as AppRole),
    isSuspended: profile?.is_suspended ?? false,
  };
});

export type SellerContext = SessionUser & { store: { name: string; slug: string } };

/** Gate for seller-only pages/actions: approved AND currently active (not suspended). */
export async function requireActiveSeller(nextPath?: string): Promise<SellerContext> {
  const user = await requireRole(["seller"], nextPath);
  const supabase = await createClient();
  const { data: store } = await supabase
    .from("seller_profiles")
    .select("store_name,slug,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store || store.status !== "active") redirect("/seller");
  return { ...user, store: { name: store.store_name, slug: store.slug } };
}

/** Server-side gate for pages, server actions and route handlers. */
export async function requireRole(allowed: readonly AppRole[], nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  if (user.isSuspended) redirect("/login?error=suspended");
  if (!hasAnyRole(user.roles, allowed)) redirect("/forbidden");
  return user;
}
