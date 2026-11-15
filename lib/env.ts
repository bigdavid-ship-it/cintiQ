import "server-only";

/** Server-only environment access. Throws a clear error when required config is missing. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(name);
  return v;
}

export class ConfigError extends Error {
  constructor(public readonly variable: string) {
    super(`Service not configured: missing environment variable ${variable}`);
    this.name = "ConfigError";
  }
}

export const serverEnv = {
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  paystackSecretKey: () => required("PAYSTACK_SECRET_KEY"),
  resendApiKey: () => required("RESEND_API_KEY"),
};

export function isConfigured(...names: string[]): boolean {
  return names.every((n) => !!process.env[n]);
}
