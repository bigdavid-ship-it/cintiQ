import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ngn = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
/** Amounts are stored as integer kobo; format for display only. */
export function formatKobo(kobo: number): string {
  return ngn.format(kobo / 100);
}
