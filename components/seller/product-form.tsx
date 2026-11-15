"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileField, FormBanner, Select, Textarea } from "@/components/ui/form-parts";
import type { ActionState } from "@/lib/auth/actions";

type Props = {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  categories: { id: string; name: string }[];
  product?: { name: string; description: string; priceNaira: string; quantity: number; categoryId: string; status: string };
  imagesLeft: number;
  submitLabel: string;
};

export function ProductForm({ action, categories, product, imagesLeft, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as ActionState);
  const e = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormBanner state={state} />
      <Field label="Product name" name="name" defaultValue={product?.name} required error={e("name")} />
      <Textarea label="Description" name="description" defaultValue={product?.description} error={e("description")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price (₦)" name="price" inputMode="decimal" defaultValue={product?.priceNaira} required error={e("price")} />
        <Field label="Quantity in stock" name="quantity" type="number" min={0} step={1} defaultValue={product?.quantity ?? 1} required error={e("quantity")} />
      </div>
      <Select label="Category" name="categoryId" defaultValue={product?.categoryId ?? ""} required error={e("categoryId")}>
        <option value="" disabled>Select a category</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Select label="Visibility" name="status" defaultValue={product?.status ?? "draft"}>
        <option value="draft">Draft (not visible to customers)</option>
        <option value="active">Published</option>
        <option value="archived">Archived</option>
      </Select>
      {imagesLeft > 0 && (
        <FileField label="Add photos & videos" name="images" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hint={`JPEG, PNG, WebP (up to 5MB) or MP4, WebM, MOV video (up to 25MB). You can add ${imagesLeft} more.`} error={e("images")} />
      )}
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {submitLabel}
      </Button>
    </form>
  );
}
