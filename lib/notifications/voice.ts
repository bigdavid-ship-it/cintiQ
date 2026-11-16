import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

function isVoiceConfigured(): boolean {
  return Boolean(
    process.env.AFRICASTALKING_API_KEY?.trim() &&
      process.env.AFRICASTALKING_USERNAME?.trim() &&
      process.env.AFRICASTALKING_VOICE_NUMBER?.trim(),
  );
}

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("0") && cleaned.length === 11) return `+234${cleaned.slice(1)}`;
  if (cleaned.startsWith("234")) return `+${cleaned}`;
  return cleaned;
}

/**
 * Places an automated Africa's Talking voice call to alert a seller of a new paid order.
 * Gracefully no-ops if Africa's Talking env vars are not configured.
 */
export async function callSellerForNewOrder(params: {
  sellerId: string;
  orderId: string;
}): Promise<void> {
  if (!isVoiceConfigured()) return;

  const admin = createAdminClient();
  const { data: seller } = await admin
    .from("seller_profiles")
    .select("phone, store_name")
    .eq("user_id", params.sellerId)
    .maybeSingle();

  const to = seller?.phone ? normalizePhone(seller.phone) : null;
  if (!to) return;

  const username = process.env.AFRICASTALKING_USERNAME!.trim();
  const apiKey = process.env.AFRICASTALKING_API_KEY!.trim();
  const from = process.env.AFRICASTALKING_VOICE_NUMBER!.trim();
  const endpoint =
    username === "sandbox"
      ? "https://voice.sandbox.africastalking.com/call"
      : "https://voice.africastalking.com/call";

  const body = new URLSearchParams({
    username,
    from,
    to,
    clientRequestId: `order-${params.orderId}`,
  });

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Africa's Talking voice call failed:", res.status, text);
    }
  } catch (err) {
    console.error("Africa's Talking voice call error:", err);
  }
}
