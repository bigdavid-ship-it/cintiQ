// Live RLS / privilege-escalation verification against the configured Supabase project.
// Creates a throwaway customer, attempts forbidden operations, then deletes it.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mk = (k) => createClient(url, k, { auth: { persistSession: false } });
const admin = mk(svc);
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

const email = `rls-test-${Date.now()}@example.com`, password = "Str0ngTestPassword1";
const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "RLS Test", role: "super_admin" } });
if (ce) { console.error(ce.message); process.exit(1); }
const uid = created.user.id;
try {
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  check("signup grants only customer role (metadata role ignored)", roles?.length === 1 && roles[0].role === "customer");

  const anonC = mk(anon);
  const { data: anonProfiles } = await anonC.from("profiles").select("id");
  check("anonymous cannot read profiles", !anonProfiles?.length);
  const { data: cats } = await anonC.from("categories").select("id");
  check("anonymous can read active categories", cats?.length === 8);
  const { data: pubSettings } = await anonC.from("platform_settings").select("key");
  check("anonymous sees only public settings", pubSettings?.every((s) => s.key === "dispute_window_days") && pubSettings.length === 1);

  const user = mk(anon);
  const { error: se } = await user.auth.signInWithPassword({ email, password });
  check("customer can sign in", !se);

  const { data: own } = await user.from("profiles").select("id");
  check("customer sees only own profile", own?.length === 1 && own[0].id === uid);

  const ins = await user.from("user_roles").insert({ user_id: uid, role: "super_admin" });
  check("customer cannot insert role", !!ins.error);
  const rpc = await user.rpc("set_user_role", { _target: uid, _role: "admin", _grant: true });
  check("customer cannot call set_user_role", !!rpc.error);
  const { data: after } = await admin.from("user_roles").select("role").eq("user_id", uid);
  check("customer still has only customer role", after?.length === 1);

  await user.from("profiles").update({ is_suspended: true, email: "x@x.com" }).eq("id", uid);
  const { data: p } = await admin.from("profiles").select("is_suspended,email").eq("id", uid).single();
  check("customer cannot edit is_suspended/email", p.is_suspended === false && p.email === email);

  const { data: logs } = await user.from("audit_logs").select("id");
  check("customer cannot read audit logs", !logs?.length);
  const setRes = await user.from("platform_settings").update({ value: 0 }).eq("key", "default_commission_percent").select();
  check("customer cannot change settings", !setRes.data?.length);
  const catRes = await user.from("categories").insert({ name: "Hack", slug: "hack" });
  check("customer cannot create categories", !!catRes.error);

  // Provisioned super admin
  const adm = mk(anon);
  const { error: ae } = await adm.auth.signInWithPassword({ email: process.env.INITIAL_ADMIN_EMAIL, password: process.env.INITIAL_ADMIN_PASSWORD });
  check("super admin can sign in", !ae);
  const { data: allProfiles } = await adm.from("profiles").select("id");
  check("admin can read all profiles", (allProfiles?.length ?? 0) >= 2);
  const grant = await adm.rpc("set_user_role", { _target: uid, _role: "admin", _grant: true });
  check("super admin can grant admin role", !grant.error);
  const { data: logs2 } = await adm.from("audit_logs").select("action").eq("entity_id", uid);
  check("role grant was audited", logs2?.some((l) => l.action === "role.grant"));
  const upd = await adm.from("audit_logs").update({ action: "x" }).eq("entity_id", uid);
  check("audit log is immutable", !!upd.error);
} finally {
  await admin.from("audit_logs").select("id").limit(0);
  await admin.auth.admin.deleteUser(uid);
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
