import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/form-parts";
import { saveCategoryAction, toggleCategoryAction } from "@/lib/categories/actions";
import type { Category } from "@/lib/types";

export const metadata = { title: "Categories" };

export default async function AdminCategories({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole(["admin"], "/admin/categories");
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").order("sort_order");
  const cats = (data ?? []) as Category[];
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Categories</h1>
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
        {cats.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 p-3">
            <form action={saveCategoryAction.bind(null, c.id)} className="flex flex-1 flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`n-${c.id}`}>Name</label>
              <input id={`n-${c.id}`} name="name" defaultValue={c.name} className="h-9 min-w-40 flex-1 rounded-md border border-border px-2 text-sm" />
              <label className="sr-only" htmlFor={`o-${c.id}`}>Sort order</label>
              <input id={`o-${c.id}`} name="sortOrder" type="number" defaultValue={c.sort_order} className="h-9 w-20 rounded-md border border-border px-2 text-sm" />
              <Button type="submit" variant="outline" className="h-9">Save</Button>
            </form>
            <StatusBadge status={c.is_active ? "active" : "archived"} />
            <form action={toggleCategoryAction.bind(null, c.id, !c.is_active)}>
              <Button type="submit" variant="ghost" className="h-9">{c.is_active ? "Deactivate" : "Activate"}</Button>
            </form>
          </li>
        ))}
      </ul>
      <form action={saveCategoryAction.bind(null, null)} className="mt-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="new-name" className="text-sm font-medium">New category</label>
          <input id="new-name" name="name" required minLength={2} className="h-10 w-full rounded-md border border-border px-3 text-sm" />
        </div>
        <input type="hidden" name="sortOrder" value={cats.length + 1} />
        <Button type="submit">Add category</Button>
      </form>
    </main>
  );
}
