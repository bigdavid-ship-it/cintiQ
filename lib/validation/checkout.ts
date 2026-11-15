import { z } from "zod";
import { phoneSchema } from "@/lib/validation/auth";

export const cartAddSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(99, "Maximum 99 per item"),
});

export const cartUpdateSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(99),
});

export const addressSchema = z.object({
  label: z.string().trim().min(1, "Enter a label (e.g. Hostel, Office)").max(40),
  recipientName: z.string().trim().min(2, "Enter recipient name").max(120),
  phone: phoneSchema,
  address: z.string().trim().min(5, "Enter full delivery address or campus location").max(300),
});

export const checkoutSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(80),
  fulfilmentMethod: z.enum(["delivery", "collection"]),
  recipientName: z.string().trim().min(2, "Enter recipient name").max(120),
  recipientPhone: phoneSchema,
  deliveryAddress: z.string().trim().min(5, "Enter delivery address or collection note").max(300),
  notes: z.string().trim().max(500).optional(),
  saveAddress: z.string().optional(),
  addressLabel: z.string().trim().max(40).optional(),
});
