import "server-only";
import { isConfigured, serverEnv } from "@/lib/env";

export type EmailSendResult = { ok: true; id: string } | { ok: false; reason: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Branded cintiQ HTML email layout for all transactional emails. */
export function renderCintiqEmailHtml(params: {
  title: string;
  body: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const safeTitle = escapeHtml(params.title);
  const safeBody = escapeHtml(params.body).replace(/\n/g, "<br/>");
  const firstName = params.recipientName?.trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
  const footerRecipient = params.recipientEmail
    ? `Sent to ${escapeHtml(params.recipientEmail)} · cintiQ Campus Commerce Network`
    : "Sent by cintiQ Campus Commerce Network";
  const cta =
    params.ctaLabel && params.ctaUrl
      ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#0e5c63;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">${escapeHtml(params.ctaLabel)}</a></p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#fafaf7;font-family:Inter,Arial,sans-serif;color:#12161c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e0d8;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="background:#0e5c63;padding:18px 24px;color:#ffffff;">
        <span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;">cinti<span style="color:#e8a33d;">Q</span></span>
        <span style="display:block;font-size:11px;opacity:0.85;margin-top:2px;">Your Campus. Your Marketplace.</span>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#12161c;">${greeting}</p>
        <h1 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#12161c;">${safeTitle}</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#3d4450;">${safeBody}</p>
        ${cta}
      </td>
    </tr>
    <tr>
      <td style="border-top:1px solid #e2e0d8;padding:14px 24px;font-size:11px;color:#5d6572;">
        ${footerRecipient}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends transactional email via Resend.
 * Never simulates delivery when RESEND_API_KEY / EMAIL_FROM are absent.
 */
export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailSendResult> {
  if (!isConfigured("RESEND_API_KEY", "EMAIL_FROM")) {
    return { ok: false, reason: "Email provider not configured (RESEND_API_KEY or EMAIL_FROM missing)" };
  }

  const rawFrom = process.env.EMAIL_FROM!;
  const from = rawFrom.includes("<") ? rawFrom : `cintiQ <${rawFrom}>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.resendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  const data = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok || !data?.id) {
    return { ok: false, reason: data?.message ?? `Email send failed (${res.status})` };
  }
  return { ok: true, id: data.id };
}
