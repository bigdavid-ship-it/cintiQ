import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SupportRealtimeRefresh } from "@/components/support/support-realtime-refresh";

const NAV = [
  ["/admin", "Overview"],
  ["/admin/sellers", "Sellers"],
  ["/admin/products", "Products"],
  ["/admin/categories", "Categories"],
  ["/admin/transactions", "Transactions"],
  ["/admin/disputes", "Disputes"],
  ["/admin/settlements", "Settlements"],
  ["/admin/users", "Users"],
  ["/admin/settings", "Settings"],
  ["/admin/support", "Support"],
  ["/admin/audit", "Audit log"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin"], "/admin"); // every admin route is gated here AND in its own page/action
  const supabase = await createClient();
  const { count: unreadChats } = await supabase
    .from("support_conversations")
    .select("id", { count: "exact", head: true })
    .gt("admin_unread", 0);

  return (
    <div>
      <SupportRealtimeRefresh />
      <nav aria-label="Admin" className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {label}
              {href === "/admin/support" && (unreadChats ?? 0) > 0 && (
                <span className="flex min-w-4 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadChats}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}
