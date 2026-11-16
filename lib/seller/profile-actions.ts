"use server";

import { revalidatePath } from "next/cache";
import { requireActiveSeller } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneSchema } from "@/lib/validation/auth";
import type { ActionState } from "@/lib/auth/actions";

export async function updateSellerPhoneAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const seller = await requireActiveSeller("/seller/finance");
  const parsed = phoneSchema.safeParse(fd.get("phone"));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: { phone: [parsed.error.issues[0]?.message ?? "Enter a valid phone number (e.g. 0803... or +234...)."] },
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("seller_profiles")
    .update({ phone: parsed.data })
    .eq("user_id", seller.id);

  if (error) {
    return { ok: false, message: "Could not update your phone number. Please try again." };
  }

  await audit(seller.id, "seller.phone.update", "seller_profile", seller.id, { phone: parsed.data });
  revalidatePath("/seller");
  revalidatePath("/seller/finance");
  return { ok: true, message: `Store phone updated to ${parsed.data}.` };
}
