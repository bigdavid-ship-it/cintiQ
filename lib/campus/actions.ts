"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const COOKIE = "cintiq_campus";

export async function selectCampusAction(fd: FormData) {
  const campusId = String(fd.get("campusId") ?? "").trim();
  const store = await cookies();

  if (!campusId || campusId === "all") {
    store.delete(COOKIE);
  } else {
    store.set(COOKIE, campusId, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" });
    const user = await getSessionUser();
    if (user) {
      const supabase = await createClient();
      await supabase.from("profiles").update({ campus_id: campusId }).eq("id", user.id);
    }
  }

  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath("/shop");
}
