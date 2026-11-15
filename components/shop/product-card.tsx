import Link from "next/link";
import Image from "next/image";
import { ImageOff, Play } from "lucide-react";
import { availability, firstImage, firstMedia, type ProductRow } from "@/lib/types";
import { formatKobo } from "@/lib/utils";
import { isVideoPath, productImageUrl } from "@/lib/storage";

export function ProductCard({ product }: { product: ProductRow }) {
  const img = firstImage(product);
  const media = img ?? firstMedia(product);
  const hasVideo = (product.product_images ?? []).some((m) => isVideoPath(m.storage_path));
  const stock = availability(product);
  return (
    <Link href={`/products/${product.id}`} className="group block overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-square bg-muted">
        {img ? (
          <Image src={productImageUrl(img)} alt={product.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
        ) : media && isVideoPath(media) ? (
          <video src={productImageUrl(media)} muted playsInline preload="metadata" className="h-full w-full bg-black object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="size-6" aria-hidden /></div>
        )}
        {hasVideo && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Play className="size-3 fill-white" aria-hidden /> Video
          </span>
        )}
        {stock === "out_of_stock" && (
          <span className="absolute left-2 top-2 rounded bg-foreground px-2 py-0.5 text-xs text-white">Sold out</span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
        <p className="font-display text-base font-semibold">{formatKobo(product.price_kobo)}</p>
        {product.seller_profiles && <p className="truncate text-xs text-muted-foreground">{product.seller_profiles.store_name}</p>}
      </div>
    </Link>
  );
}
