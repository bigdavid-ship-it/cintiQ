"use client";

import { startTransition, useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileField, FormBanner, Select, Textarea } from "@/components/ui/form-parts";
import { createClient } from "@/lib/supabase/client";
import type { ActionState } from "@/lib/auth/actions";

const MEDIA_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function resolveMediaExt(file: File): { mime: string; ext: string; isVideo: boolean } | null {
  if (file.type && MEDIA_EXT_BY_MIME[file.type]) {
    return { mime: file.type, ext: MEDIA_EXT_BY_MIME[file.type], isVideo: file.type.startsWith("video/") };
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { mime: "image/jpeg", ext: "jpg", isVideo: false };
  if (lower.endsWith(".png")) return { mime: "image/png", ext: "png", isVideo: false };
  if (lower.endsWith(".webp")) return { mime: "image/webp", ext: "webp", isVideo: false };
  if (lower.endsWith(".mp4")) return { mime: "video/mp4", ext: "mp4", isVideo: true };
  if (lower.endsWith(".webm")) return { mime: "video/webm", ext: "webm", isVideo: true };
  if (lower.endsWith(".mov")) return { mime: "video/quicktime", ext: "mov", isVideo: true };
  return null;
}

type Props = {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  categories: { id: string; name: string }[];
  product?: { name: string; description: string; priceNaira: string; quantity: number; categoryId: string; status: string };
  imagesLeft: number;
  submitLabel: string;
};

export function ProductForm({ action, categories, product, imagesLeft, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as ActionState);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const e = (k: string) => state.fieldErrors?.[k]?.[0];

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setUploadError(null);
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const files = fd.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);

    if (files.length > 0) {
      if (files.length > imagesLeft) {
        setUploadError(`You can add at most ${imagesLeft} more photo${imagesLeft === 1 ? "" : "s"} or video${imagesLeft === 1 ? "" : "s"}.`);
        return;
      }

      const resolved = files.map((file) => ({ file, meta: resolveMediaExt(file) }));
      for (const { file, meta } of resolved) {
        if (!meta) {
          setUploadError(`${file.name}: Only JPEG, PNG, WebP images or MP4, WebM, MOV videos are allowed.`);
          return;
        }
        const maxMb = meta.isVideo ? 25 : 5;
        if (file.size > maxMb * 1024 * 1024) {
          setUploadError(`${file.name}: File exceeds ${maxMb}MB.`);
          return;
        }
      }

      setUploading(true);
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) {
          setUploadError("Please sign in again before uploading media.");
          setUploading(false);
          return;
        }

        const results = await Promise.all(
          resolved.map(async ({ file, meta }) => {
            if (!meta) return { ok: false as const, error: "Invalid file" };
            const path = `${userId}/uploads/${crypto.randomUUID()}.${meta.ext}`;
            const { error } = await supabase.storage
              .from("product-images")
              .upload(path, file, { contentType: meta.mime });
            if (error) return { ok: false as const, error: `${file.name}: ${error.message || "upload failed"}` };
            return { ok: true as const, path };
          }),
        );

        const uploadedPaths = results.filter((r): r is { ok: true; path: string } => r.ok).map((r) => r.path);
        const failed = results.find((r) => !r.ok);
        if (failed && !failed.ok) {
          if (uploadedPaths.length > 0) {
            await supabase.storage.from("product-images").remove(uploadedPaths);
          }
          setUploadError(failed.error);
          setUploading(false);
          return;
        }

        fd.delete("images");
        fd.set("uploadedMedia", JSON.stringify(uploadedPaths));
        const fileInput = form.querySelector<HTMLInputElement>('input[name="images"]');
        if (fileInput) fileInput.value = "";
      } catch {
        setUploadError("Upload failed. Please check your connection and try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    startTransition(() => {
      formAction(fd);
    });
  }

  const busy = uploading || pending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormBanner state={state} />
      {uploadError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {uploadError}
        </p>
      )}
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
        <FileField label="Add photos & videos" name="images" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hint={`JPEG, PNG, WebP (up to 5MB) or MP4, WebM, MOV video (up to 25MB). You can add ${imagesLeft} more.`} error={e("images") ?? uploadError ?? undefined} />
      )}
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {uploading ? "Uploading media..." : submitLabel}
      </Button>
    </form>
  );
}
