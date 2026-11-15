"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser, requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailSchema } from "@/lib/validation/auth";
import type { ActionState } from "@/lib/auth/actions";

export async function toggleSavedProductAction(productId: string) {
  const user = await requireRole(["customer", "seller", "admin", "super_admin"]);
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("saved_products")
    .select("id")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase.from("saved_products").delete().eq("id", existing.id);
    revalidatePath(`/products/${productId}`);
    revalidatePath("/account/saved");
  } else {
    await supabase.from("saved_products").insert({ user_id: user.id, product_id: productId });
    revalidatePath(`/products/${productId}`);
    revalidatePath("/account/saved");
    redirect("/account/saved");
  }
}

const supportSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: emailSchema,
  subject: z.string().trim().min(3, "Enter a subject").max(160),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(3000),
});

export async function submitSupportTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = supportSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const user = await getSessionUser();
  const supabase = await createClient();
  const { error } = await supabase.from("support_tickets").insert({
    user_id: user?.id ?? null,
    name: parsed.data.name,
    email: parsed.data.email,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });

  if (error) return { ok: false, message: "Could not send message right now. Please try again." };

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await createAdminClient().rpc("notify_admins", {
      _type: "support.ticket",
      _title: `Support: ${parsed.data.subject}`,
      _body: `From ${parsed.data.name} (${parsed.data.email})`,
      _link: "/admin/reports",
    });
  }

  return { ok: true, message: "Your message has been received. Our support team will get back to you." };
}
