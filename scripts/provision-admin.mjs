// Secure server-side provisioning of the initial super administrator.
// Run locally with service-role credentials: npm run provision:admin
// There is deliberately no public route for this.
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, INITIAL_ADMIN_EMAIL: email, INITIAL_ADMIN_PASSWORD: password } = process.env;
if (!url || !key || !email || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await sb.from("user_roles").select("id").eq("role", "super_admin").limit(1);
if (existing?.length) {
  console.error("A super administrator already exists. Use the admin console to manage roles.");
  process.exit(1);
}

const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Super Administrator" } });
if (error) { console.error(error.message); process.exit(1); }

const { error: roleErr } = await sb.from("user_roles").insert([
  { user_id: data.user.id, role: "super_admin" },
  { user_id: data.user.id, role: "admin" },
]);
if (roleErr) { console.error(roleErr.message); process.exit(1); }
await sb.rpc("write_audit", { _actor: data.user.id, _action: "admin.provisioned", _entity_type: "user", _entity_id: data.user.id, _metadata: {} });
console.log(`Super administrator created: ${email}`);
