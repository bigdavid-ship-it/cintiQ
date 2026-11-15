import Link from "next/link";
import { requireRole } from "@/lib/auth/session";

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
  ["/admin/reports", "Support"],
  ["/admin/audit", "Audit log"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin"], "/admin"); // every admin route is gated here AND in its own page/action
  return (
    <div>
      <nav aria-label="Admin" className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">{label}</Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}
