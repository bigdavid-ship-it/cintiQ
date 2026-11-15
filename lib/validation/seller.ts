import { z } from "zod";
import { emailSchema, phoneSchema } from "@/lib/validation/auth";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const sellerApplicationSchema = z
  .object({
    sellerType: z.enum(["student", "business"]),
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    businessName: z.string().trim().min(2, "Enter a store or business name").max(100),
    phone: phoneSchema,
    email: emailSchema,
    studentIdNumber: optionalText(40),
    institution: optionalText(120),
    businessLocation: z.string().trim().min(5, "Describe where you operate").max(300),
    businessRegistrationNumber: optionalText(60),
    description: z.string().trim().min(20, "Describe what you sell (at least 20 characters)").max(2000),
    categoryIds: z.array(z.string().uuid()).min(1, "Select at least one category").max(8),
    bankName: z.string().trim().min(2, "Enter your bank").max(80),
    accountNumber: z.string().trim().regex(/^\d{10}$/, "Account number must be 10 digits"),
    accountName: z.string().trim().min(2, "Enter the account name").max(120),
  })
  .superRefine((d, ctx) => {
    if (d.sellerType === "student" && (!d.studentIdNumber || d.studentIdNumber.length < 3)) {
      ctx.addIssue({ code: "custom", path: ["studentIdNumber"], message: "Student ID / matric number is required" });
    }
  });

export const rejectionSchema = z.object({ reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(1000) });

export function parseApplicationForm(fd: FormData) {
  return sellerApplicationSchema.safeParse({
    ...Object.fromEntries(fd),
    categoryIds: fd.getAll("categoryIds").map(String),
  });
}
