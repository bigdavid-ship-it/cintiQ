"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

/** Accessible labelled input with inline error and password visibility toggle. */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, id, className, type, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    const isPassword = type === "password";
    const inputId = id ?? props.name;
    const errId = `${inputId}-error`;

    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={isPassword && show ? "text" : type}
            aria-invalid={!!error}
            aria-describedby={error ? errId : undefined}
            className={cn(
              "h-10 w-full rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground",
              isPassword && "pr-10",
              error && "border-danger",
              className,
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          )}
        </div>
        {error && (
          <p id={errId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Field.displayName = "Field";
