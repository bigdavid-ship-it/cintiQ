import Link from "next/link";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { availability, firstImage, type ProductRow } from "@/lib/types";
import { formatKobo } from "@/lib/utils";
import { productImageUrl } from "@/lib/storage";

export function ProductCard({ product }: { product: ProductRow }) {
  const img = firstImage(product);
  const stock = availability(product);
  return (
    <Link href={`/products/${product.id}`} className="group block overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-square bg-muted">
        {img ? (
          <Image src={productImageUrl(img)} alt={product.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="size-6" aria-hidden /></div>
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
