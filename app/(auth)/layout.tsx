import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-4 py-6 sm:py-10">
      <div className="mb-5"><Logo /></div>
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">{children}</div>
    </main>
  );
}
