export type UploadKind = "image" | "document";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const ALLOWED: Record<UploadKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  document: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};
const MAX_BYTES: Record<UploadKind, number> = { image: 5 * 1024 * 1024, document: 8 * 1024 * 1024 };

/** Detect the real type from file bytes; the browser-supplied MIME type is never trusted. */
export function sniffMime(bytes: Uint8Array): string | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return "image/webp";
  return null;
}

export type ValidatedUpload = { ok: true; mime: string; ext: string; bytes: Uint8Array } | { ok: false; error: string };

export async function validateUpload(file: File, kind: UploadKind): Promise<ValidatedUpload> {
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > MAX_BYTES[kind]) return { ok: false, error: `File exceeds ${MAX_BYTES[kind] / 1024 / 1024}MB.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || !ALLOWED[kind].includes(mime)) {
    return { ok: false, error: kind === "image" ? "Only JPEG, PNG or WebP images are allowed." : "Only JPEG, PNG, WebP or PDF files are allowed." };
  }
  return { ok: true, mime, ext: MIME_EXT[mime], bytes };
}

/** Returns real File objects only (empty file inputs submit a zero-byte File). */
export function filesFrom(formData: FormData, name: string): File[] {
  return formData.getAll(name).filter((v): v is File => v instanceof File && v.size > 0);
}
