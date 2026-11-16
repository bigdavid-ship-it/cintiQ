import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

/** Nigerian-friendly: accepts 0803..., +234803..., normalises to E.164 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .transform((v) => (v.startsWith("0") ? `+234${v.slice(1)}` : v.startsWith("234") ? `+${v}` : v))
  .refine((v) => /^\+[0-9]{10,15}$/.test(v), "Enter a valid phone number");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(72),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const verifyResetOtpSchema = z.object({
  email: emailSchema,
  token: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit OTP code from your email"),
});

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    token: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit OTP code from your email"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
