"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/lib/cart/actions";
import type { ActionState } from "@/lib/auth/actions";

export function AddToCartForm({ productId, maxQuantity, disabled }: { productId: string; maxQuantity: number; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addToCartAction, { ok: false });

  if (disabled || maxQuantity <= 0) {
    return (
      <Button disabled className="mt-6 w-full sm:w-auto">
        Out of stock
      </Button>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="productId" value={productId} />
        <div className="space-y-1">
          <label htmlFor="qty" className="text-xs font-medium text-muted-foreground">
            Quantity
          </label>
          <input
            id="qty"
            name="quantity"
            type="number"
            min={1}
            max={Math.min(99, maxQuantity)}
            defaultValue={1}
            className="h-10 w-20 rounded-md border border-border bg-card px-3 text-sm"
          />
        </div>
        <Button type="submit" disabled={pending} className="flex-1 sm:flex-initial">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShoppingCart className="size-4" aria-hidden />}
          Add to cart
        </Button>
      </form>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}{" "}
          {state.ok && (
            <Link href="/cart" className="font-medium underline">
              View cart
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
