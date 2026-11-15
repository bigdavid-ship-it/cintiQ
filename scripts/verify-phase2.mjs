// Live Phase 2 verification: seller workflow, products, storage and RLS against the real project.
// Creates throwaway users/data and removes them afterwards.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mk = (k) => createClient(url, k, { auth: { persistSession: false } });
const admin = mk(svc);
let failed = 0;
const check = (name, ok, extra) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? "  -> " + extra : ""}`); if (!ok) failed++; };

const stamp = Date.now(), password = "Str0ngTestPassword1";
const mkUser = async (tag) => {
  const email = `p2-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = mk(anon); const { error: se } = await c.auth.signInWithPassword({ email, password }); if (se) throw se;
  return { id: data.user.id, email, c };
};
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const created = [];
const paths = { img: [], doc: [] };

try {
  const seller = await mkUser("seller"), other = await mkUser("other"), buyer = await mkUser("buyer");
  created.push(seller.id, other.id, buyer.id);
  const { data: cats } = await admin.from("categories").select("id").eq("is_active", true).limit(2);

  // --- application as a customer
  const appRow = { user_id: seller.id, seller_type: "student", full_name: "P2 Seller", business_name: "P2 Snacks", phone: "+2348031234567", email: seller.email,
    student_id_number: "18/0001", business_location: "Hostel 2, Block C", description: "Snacks and drinks for students on campus.", category_ids: [cats[0].id] };
  const spoof = await seller.c.from("seller_applications").insert({ ...appRow, status: "approved" });
  check("applicant cannot self-set status=approved", !!spoof.error);
  const { data: app, error: appErr } = await seller.c.from("seller_applications").insert(appRow).select("id,status").single();
  check("applicant can submit application (status pending)", !appErr && app?.status === "pending", appErr?.message);
  const dup = await seller.c.from("seller_applications").insert(appRow);
  check("second open application is rejected", !!dup.error);

  const doc = `${seller.id}/${crypto.randomUUID()}.png`; paths.doc.push(doc);
  const up = await seller.c.storage.from("seller-documents").upload(doc, png, { contentType: "image/png" });
  check("applicant can upload own document", !up.error, up.error?.message);
  const stolen = `${other.id}/${crypto.randomUUID()}.png`;
  const up2 = await seller.c.storage.from("seller-documents").upload(stolen, png, { contentType: "image/png" });
  check("applicant cannot upload into another user's folder", !!up2.error);
  const badMime = await seller.c.storage.from("seller-documents").upload(`${seller.id}/x.html`, new TextEncoder().encode("<script>"), { contentType: "text/html" });
  check("bucket rejects disallowed MIME types", !!badMime.error);
  const bank = await seller.c.from("seller_bank_accounts").insert({ user_id: seller.id, application_id: app.id, bank_name: "GTBank", account_number: "0123456789", account_name: "P2 Seller" });
  check("applicant can submit bank details", !bank.error, bank.error?.message);
  const badBank = await seller.c.from("seller_bank_accounts").insert({ user_id: seller.id, application_id: app.id, bank_name: "X", account_number: "12" , account_name: "Y"});
  check("invalid bank account number rejected", !!badBank.error);
  const dd = await seller.c.from("seller_verification_documents").insert({ application_id: app.id, user_id: seller.id, doc_type: "student_id", storage_path: doc, original_name: "id.png", mime_type: "image/png", size_bytes: 12 });
  check("applicant can record document", !dd.error, dd.error?.message);

  // --- privacy
  const peek = await other.c.from("seller_applications").select("id");
  check("other users cannot read applications", !peek.data?.length);
  const peekBank = await other.c.from("seller_bank_accounts").select("id");
  check("other users cannot read bank accounts", !peekBank.data?.length);
  const peekDoc = await other.c.storage.from("seller-documents").download(doc);
  check("other users cannot download documents", !!peekDoc.error);
  const anonBank = await mk(anon).from("seller_bank_accounts").select("id");
  check("anonymous cannot read bank accounts", !anonBank.data?.length);

  // --- gating before approval
  const pre = await seller.c.from("products").insert({ seller_id: seller.id, category_id: cats[0].id, name: "Early", price_kobo: 1000, quantity: 1 });
  check("unapproved seller cannot create products", !!pre.error);
  const selfApprove = await seller.c.rpc("review_seller_application", { _id: app.id, _decision: "approved" });
  check("applicant cannot approve own application", !!selfApprove.error);

  // --- admin review
  const adm = mk(anon);
  await adm.auth.signInWithPassword({ email: process.env.INITIAL_ADMIN_EMAIL, password: process.env.INITIAL_ADMIN_PASSWORD });
  const seeDoc = await adm.storage.from("seller-documents").createSignedUrl(doc, 60);
  check("admin can view applicant documents", !!seeDoc.data?.signedUrl, seeDoc.error?.message);
  const noReason = await adm.rpc("review_seller_application", { _id: app.id, _decision: "rejected" });
  check("rejection requires a reason", !!noReason.error);
  const rev = await adm.rpc("review_seller_application", { _id: app.id, _decision: "under_review" });
  check("admin can start review", !rev.error, rev.error?.message);
  const back = await adm.rpc("review_seller_application", { _id: app.id, _decision: "under_review" });
  check("invalid transition under_review -> under_review rejected", !!back.error);
  const ok = await adm.rpc("review_seller_application", { _id: app.id, _decision: "approved" });
  check("admin can approve", !ok.error, ok.error?.message);
  const again = await adm.rpc("review_seller_application", { _id: app.id, _decision: "rejected", _reason: "too late now" });
  check("approved application cannot be rejected afterwards", !!again.error);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", seller.id);
  check("approval grants seller role", roles?.some((r) => r.role === "seller"));
  const { data: notes } = await admin.from("notifications").select("type").eq("user_id", seller.id);
  check("seller was notified (stored notification)", (notes?.length ?? 0) >= 2);
  const { data: adminNotes } = await admin.from("notifications").select("id").eq("type", "seller.application").limit(1);
  check("admins were notified of new application", !!adminNotes?.length);

  // --- products
  const prod = { seller_id: seller.id, category_id: cats[0].id, name: "P2 Jollof", description: "Tasty jollof rice", price_kobo: 150000, quantity: 5, status: "active" };
  const { data: p, error: pe } = await seller.c.from("products").insert(prod).select("id").single();
  check("approved seller can create product", !pe, pe?.message);
  const feat = await seller.c.from("products").update({ is_featured: true }).eq("id", p.id);
  check("seller cannot feature own product", !!feat.error);
  const negq = await seller.c.from("products").update({ quantity: -1 }).eq("id", p.id);
  check("negative inventory rejected", !!negq.error);
  const zero = await seller.c.from("products").insert({ ...prod, price_kobo: 0 });
  check("zero price rejected", !!zero.error);
  const impersonate = await other.c.from("products").insert({ ...prod, name: "Fake" });
  check("customer cannot create products as another seller", !!impersonate.error);
  const hijack = await other.c.from("products").update({ price_kobo: 1 }).eq("id", p.id).select();
  check("other users cannot edit someone's product", !hijack.data?.length);

  const img = `${seller.id}/${p.id}/${crypto.randomUUID()}.png`; paths.img.push(img);
  const iu = await seller.c.storage.from("product-images").upload(img, png, { contentType: "image/png" });
  check("seller can upload product image", !iu.error, iu.error?.message);
  const bad = await other.c.storage.from("product-images").upload(`${seller.id}/${p.id}/evil.png`, png, { contentType: "image/png" });
  check("others cannot upload into seller's image folder", !!bad.error);
  const ir = await seller.c.from("product_images").insert({ product_id: p.id, storage_path: img, sort_order: 0 });
  check("image row recorded", !ir.error, ir.error?.message);
  const hijackImg = await other.c.from("product_images").insert({ product_id: p.id, storage_path: `${other.id}/x.png` });
  check("others cannot attach images to a seller's product", !!hijackImg.error);

  // --- marketplace visibility
  const pub = mk(anon);
  const { data: shown } = await pub.from("products").select("id,product_images(storage_path)").eq("id", p.id).maybeSingle();
  check("active product visible to anonymous visitors", !!shown && shown.product_images.length === 1);
  const fetched = await fetch(`${url}/storage/v1/object/public/product-images/${img}`);
  check("product image is publicly retrievable", fetched.ok);
  await seller.c.from("products").update({ status: "draft" }).eq("id", p.id);
  const { data: hidden } = await pub.from("products").select("id").eq("id", p.id).maybeSingle();
  check("draft product hidden from public", !hidden);
  await seller.c.from("products").update({ status: "active" }).eq("id", p.id);

  const mod = await adm.rpc("admin_moderate_product", { _id: p.id, _featured: true });
  check("admin can feature product", !mod.error, mod.error?.message);
  const sus = await adm.rpc("admin_moderate_product", { _id: p.id, _status: "suspended" });
  check("admin can suspend product", !sus.error);
  const { data: hidden2 } = await pub.from("products").select("id").eq("id", p.id).maybeSingle();
  check("suspended product hidden from public", !hidden2);
  const reinstate = await seller.c.from("products").update({ status: "active" }).eq("id", p.id).select();
  check("seller cannot un-suspend own product", !reinstate.data?.length);
  const custMod = await buyer.c.rpc("admin_moderate_product", { _id: p.id, _status: "active" });
  check("customer cannot call moderation RPC", !!custMod.error);
  await adm.rpc("admin_moderate_product", { _id: p.id, _status: "active" });

  // --- seller suspension
  const sp = await adm.rpc("set_seller_status", { _user: seller.id, _suspend: true, _reason: "policy test" });
  check("admin can suspend seller", !sp.error, sp.error?.message);
  const { data: hidden3 } = await pub.from("products").select("id").eq("id", p.id).maybeSingle();
  check("suspended seller's products disappear from marketplace", !hidden3);
  const { data: store } = await pub.from("seller_profiles").select("user_id").eq("user_id", seller.id).maybeSingle();
  check("suspended seller's storefront is hidden", !store);
  const susNew = await seller.c.from("products").insert({ ...prod, name: "While suspended" });
  check("suspended seller cannot create products", !!susNew.error);
  await adm.rpc("set_seller_status", { _user: seller.id, _suspend: false });
  const { data: back2 } = await pub.from("products").select("id").eq("id", p.id).maybeSingle();
  check("reactivation restores listings", !!back2);

  // --- categories
  const catW = await buyer.c.from("categories").update({ name: "hacked" }).eq("id", cats[0].id).select();
  check("customer cannot rename categories", !catW.data?.length);

  // --- audit
  const { data: logs } = await adm.from("audit_logs").select("action").eq("entity_id", app.id);
  check("review actions are audited", logs?.some((l) => l.action === "seller.application.approved"));
} catch (e) {
  console.error("Script error:", e); failed++;
} finally {
  if (paths.img.length) await admin.storage.from("product-images").remove(paths.img);
  if (paths.doc.length) await admin.storage.from("seller-documents").remove(paths.doc);
  for (const id of created) await admin.auth.admin.deleteUser(id);
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
