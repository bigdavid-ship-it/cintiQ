/** Public bucket URL for product images (bucket is public-read; writes are RLS-protected). */
export function productImageUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}
