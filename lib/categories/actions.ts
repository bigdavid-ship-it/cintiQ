"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function saveCategoryAction(id: string | null, fd: FormData) {
  const admin = await requireRole(["admin"]);
  const p = categorySchema.safeParse(Object.fromEntries(fd));
  if (!p.success) redirect(`/admin/categories?error=${encodeURIComponent("Enter a name (2-80 characters).")}`);
  const slug = slugify(p.data.name);
  if (!slug) redirect(`/admin/categories?error=${encodeURIComponent("Name must contain letters or numbers.")}`);
  const supabase = await createClient(); // RLS: admin-only writes
  const row = { name: p.data.name, slug, sort_order: p.data.sortOrder };
  const { data, error } = id
    ? await supabase.from("categories").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("categories").insert(row).select("id").maybeSingle();
  if (error || !data) redirect(`/admin/categories?error=${encodeURIComponent(error?.code === "23505" ? "A category with that name already exists." : "Could not save the category.")}`);
  await audit(admin.id, id ? "category.update" : "category.create", "category", data.id, row);
  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  redirect("/admin/categories");
}

export async function toggleCategoryAction(id: string, active: boolean) {
  const admin = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("categories").update({ is_active: active }).eq("id", id).select("id").maybeSingle();
  if (data) await audit(admin.id, active ? "category.activate" : "category.deactivate", "category", id);
  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  redirect("/admin/categories");
}
