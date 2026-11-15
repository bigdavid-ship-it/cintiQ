import { z } from "zod";
import { nairaToKobo } from "@/lib/money";

export const productSchema = z.object({
  name: z.string().trim().min(2, "Enter a product name").max(140),
  description: z.string().trim().max(4000).default(""),
  price: z
    .string()
    .transform((v, ctx) => {
      const kobo = nairaToKobo(v);
      if (kobo === null) {
        ctx.addIssue({ code: "custom", message: "Enter a valid price in naira (e.g. 2500 or 2500.50)" });
        return z.NEVER;
      }
      return kobo;
    }),
  quantity: z.coerce.number().int("Whole numbers only").min(0, "Cannot be negative").max(1_000_000),
  categoryId: z.string().uuid("Select a category"),
  status: z.enum(["draft", "active", "archived"]),
});

export type ProductInput = z.infer<typeof productSchema>;
