/** Public bucket URL for product media (bucket is public-read; writes are RLS-protected). */
export function productImageUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

const VIDEO_EXTS = /\.(mp4|webm|mov)(\?.*)?$/i;

export function isVideoPath(path: string): boolean {
  return VIDEO_EXTS.test(path);
}
