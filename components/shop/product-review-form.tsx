"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { submitReviewAction } from "@/lib/orders/actions";
import { Button } from "@/components/ui/button";

const initialState: { ok: boolean; message?: string } = { ok: false, message: "" };

export function ProductReviewForm({
  orderId,
  sellerId,
  productName,
}: {
  orderId: string;
  sellerId: string;
  productName: string;
}) {
  const boundAction = submitReviewAction.bind(null, orderId, sellerId);
  const [state, action, pending] = useActionState(boundAction, initialState);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  if (state.ok) {
    return (
      <div className="mt-4 rounded-lg border border-success/30 bg-emerald-50 p-4 text-sm text-success">
        {state.message} Thank you for reviewing this verified purchase.
      </div>
    );
  }

  const activeStars = hoverRating ?? rating;

  return (
    <form action={action} className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5">
      <div>
        <h3 className="font-display text-sm font-semibold">Write a verified buyer review</h3>
        <p className="text-xs text-muted-foreground">
          You confirmed delivery for an order containing {productName}. Share your experience.
        </p>
      </div>

      <input type="hidden" name="rating" value={rating} />

      <div className="space-y-1">
        <span className="block text-xs font-medium text-foreground">Your rating</span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={rating === star}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(null)}
              className="rounded p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Star
                className={`size-6 ${star <= activeStars ? "fill-accent text-accent" : "text-border"}`}
                aria-hidden
              />
            </button>
          ))}
          <span className="ml-2 text-xs font-medium text-muted-foreground">{activeStars} / 5</span>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="product-review-comment" className="block text-xs font-medium text-foreground">
          Review (optional)
        </label>
        <textarea
          id="product-review-comment"
          name="comment"
          rows={3}
          maxLength={1000}
          placeholder="How was the product quality, packaging, and delivery speed?"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:bg-card"
        />
      </div>

      {state.message && !state.ok && (
        <p role="alert" className="text-xs text-danger">{state.message}</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Submitting..." : "Submit review"}
      </Button>
    </form>
  );
}
