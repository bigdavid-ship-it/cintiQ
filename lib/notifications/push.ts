import "server-only";
import * as webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderCintiqEmailHtml, sendTransactionalEmail } from "@/lib/notifications/email";

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@cintiq.app";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Dispatches a notification to both:
 * 1) The user's subscribed phone/browser via Web Push (works even when the app is closed)
 * 2) The user's email/Gmail via Resend (when RESEND_API_KEY & EMAIL_FROM are configured)
 */
export async function sendUserPushAndEmail(params: {
  userId: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  const admin = createAdminClient();
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const fullLink = params.link && baseUrl ? `${baseUrl}${params.link}` : params.link;

  // 1. Background Web Push
  const vapid = getVapidConfig();
  if (vapid) {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", params.userId);

    const payload = JSON.stringify({
      title: params.title,
      body: params.body,
      link: params.link || "/account/notifications",
    });

    await Promise.allSettled(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number } | null)?.statusCode;
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      }),
    );
  }

  // 2. Branded Email / Gmail notification
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", params.userId)
    .maybeSingle();

  if (profile?.email) {
    await sendTransactionalEmail({
      to: profile.email,
      subject: `${params.title} · cintiQ`,
      html: renderCintiqEmailHtml({
        title: params.title,
        body: params.body,
        ctaLabel: fullLink ? "Open in cintiQ" : undefined,
        ctaUrl: fullLink,
      }),
    }).catch(() => {});
  }
}
