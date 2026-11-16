"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";
import { sendUserPushAndEmail } from "@/lib/notifications/push";
import type { SendResult } from "@/lib/support/types";

const MAX_LEN = 2000;

type PostParams = { ownerId: string; senderId: string; role: "user" | "admin"; body: string };

/** Inserts a message through the atomic RPC (service role) and returns it plus the pre-send unread state. */
async function postMessage(p: PostParams) {
  const admin = createAdminClient();
  const { data: before } = await admin
    .from("support_conversations")
    .select("id, admin_unread, user_unread")
    .eq("user_id", p.ownerId)
    .maybeSingle();

  const { data: messageId, error } = await admin.rpc("support_send_message", {
    _user_id: p.ownerId,
    _sender: p.senderId,
    _role: p.role,
    _body: p.body,
  });
  if (error || !messageId) return null;

  const { data: row } = await admin
    .from("support_messages")
    .select("id, conversation_id, sender_role, body, created_at")
    .eq("id", messageId as string)
    .single();
  if (!row) return null;

  return {
    message: { id: row.id, sender_role: row.sender_role as "user" | "admin", body: row.body, created_at: row.created_at },
    conversationId: row.conversation_id as string,
    adminUnreadBefore: before?.admin_unread ?? 0,
    userUnreadBefore: before?.user_unread ?? 0,
  };
}

function cleanBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = String(raw ?? "").trim();
  if (!body) return { ok: false, error: "Type a message first." };
  if (body.length > MAX_LEN) return { ok: false, error: `Messages are limited to ${MAX_LEN} characters.` };
  return { ok: true, body };
}

/** A signed-in user sends a message to the support team. */
export async function userSendSupportMessageAction(raw: string): Promise<SendResult> {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/contact");
  const parsed = cleanBody(raw);
  if (!parsed.ok) return parsed;

  const rl = rateLimit(`support-chat:${user.id}`, 20, 60_000);
  if (!rl.ok) return { ok: false, error: `You're sending messages too quickly. Try again in ${rl.retryAfterSec}s.` };

  const posted = await postMessage({ ownerId: user.id, senderId: user.id, role: "user", body: parsed.body });
  if (!posted) return { ok: false, error: "We could not send your message. Please try again." };

  // Alert admins only for the first unread message in a burst to avoid notification spam.
  if (posted.adminUnreadBefore === 0) {
    const admin = createAdminClient();
    const who = user.fullName || user.email || "A user";
    const preview = parsed.body.length > 120 ? `${parsed.body.slice(0, 117)}...` : parsed.body;
    const link = `/admin/support/${posted.conversationId}`;
    await admin.rpc("notify_admins", {
      _type: "support.message",
      _title: `New support message from ${who}`,
      _body: preview,
      _link: link,
    });
    const { data: admins } = await admin.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
    const adminIds = [...new Set((admins ?? []).map((a) => a.user_id as string))];
    await Promise.all(
      adminIds.map((id) =>
        sendUserPushAndEmail({
          userId: id,
          title: `New support message from ${who}`,
          body: preview,
          link,
          skipEmail: true,
        }).catch(() => {}),
      ),
    );
  }

  revalidatePath("/admin/support");
  return { ok: true, message: posted.message };
}

/** Only admins can reply. */
export async function adminReplySupportMessageAction(ownerId: string, raw: string): Promise<SendResult> {
  const adminUser = await requireRole(["admin"], "/admin/support");
  const parsed = cleanBody(raw);
  if (!parsed.ok) return parsed;

  const rl = rateLimit(`support-reply:${adminUser.id}`, 60, 60_000);
  if (!rl.ok) return { ok: false, error: `Slow down for a moment (${rl.retryAfterSec}s).` };

  const posted = await postMessage({ ownerId, senderId: adminUser.id, role: "admin", body: parsed.body });
  if (!posted) return { ok: false, error: "Could not send the reply. Please try again." };

  // Notify the customer on their first unread reply (in-app + phone push + email).
  if (posted.userUnreadBefore === 0) {
    const preview = parsed.body.length > 120 ? `${parsed.body.slice(0, 117)}...` : parsed.body;
    await createAdminClient().rpc("notify", {
      _user: ownerId,
      _type: "support.reply",
      _title: "cintiQ Support replied",
      _body: preview,
      _link: "/contact",
    });
    await sendUserPushAndEmail({
      userId: ownerId,
      title: "cintiQ Support replied",
      body: preview,
      link: "/contact",
    }).catch(() => {});
  }

  revalidatePath("/admin/support");
  return { ok: true, message: posted.message };
}

/** User opened/viewed their chat. */
export async function userMarkSupportReadAction(): Promise<void> {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"], "/contact");
  await createAdminClient().from("support_conversations").update({ user_unread: 0 }).eq("user_id", user.id).gt("user_unread", 0);
}

/** Admin opened/viewed a conversation. */
export async function adminMarkSupportReadAction(conversationId: string): Promise<void> {
  await requireRole(["admin"], "/admin/support");
  await createAdminClient().from("support_conversations").update({ admin_unread: 0 }).eq("id", conversationId).gt("admin_unread", 0);
}

export async function setSupportStatusAction(conversationId: string, status: "open" | "resolved"): Promise<void> {
  await requireRole(["admin"], "/admin/support");
  await createAdminClient().from("support_conversations").update({ status }).eq("id", conversationId);
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${conversationId}`);
}
