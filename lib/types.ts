import { isVideoPath } from "@/lib/storage";

export type Category = { id: string; name: string; slug: string; description: string | null; sort_order: number; is_active: boolean };

export type ProductRow = {
  id: string;
  seller_id: string;
  category_id: string;
  name: string;
  description: string;
  price_kobo: number;
  quantity: number;
  status: "draft" | "active" | "archived" | "suspended";
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  product_images?: { storage_path: string; sort_order: number }[];
  seller_profiles?: { store_name: string; slug: string } | null;
  categories?: { name: string; slug: string } | null;
};

export function availability(p: Pick<ProductRow, "status" | "quantity">): "in_stock" | "low_stock" | "out_of_stock" | "unavailable" {
  if (p.status !== "active") return "unavailable";
  if (p.quantity <= 0) return "out_of_stock";
  return p.quantity <= 5 ? "low_stock" : "in_stock";
}

export function firstImage(p: Pick<ProductRow, "product_images">): string | null {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return imgs.find((m) => !isVideoPath(m.storage_path))?.storage_path ?? null;
}

export function firstMedia(p: Pick<ProductRow, "product_images">): string | null {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return imgs[0]?.storage_path ?? null;
}
