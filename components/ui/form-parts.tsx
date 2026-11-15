import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({ label, error, children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} aria-invalid={!!error} className={cn("h-10 w-full rounded-md border border-border bg-card px-3 text-sm", error && "border-danger", className)} {...props}>
        {children}
      </select>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <textarea id={id} aria-invalid={!!error} className={cn("min-h-24 w-full rounded-md border border-border bg-card px-3 py-2 text-sm", error && "border-danger", className)} {...props} />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function FileField({ label, error, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input id={id} type="file" aria-invalid={!!error} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand" {...props} />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function FormBanner({ state }: { state: { ok: boolean; message?: string } }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-brand-soft text-success" : "bg-red-50 text-danger"}`}>
      {state.message}
    </p>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    pending: "bg-amber-50 text-amber-800", under_review: "bg-blue-50 text-blue-800", approved: "bg-green-50 text-success",
    rejected: "bg-red-50 text-danger", active: "bg-green-50 text-success", draft: "bg-muted text-muted-foreground",
    archived: "bg-muted text-muted-foreground", suspended: "bg-red-50 text-danger",
  };
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", tone[status] ?? "bg-muted")}>{status.replace("_", " ")}</span>;
}
