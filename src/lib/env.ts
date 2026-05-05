import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  INGEST_SECRET: z.string().min(32),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_ZONE_ID: z.string().min(1),
  EMAIL_DOMAIN: z.string().min(3).regex(/^[a-z0-9.-]+$/),
  MAX_ACTIVE_MAILBOXES_PER_USER: z.coerce.number().int().min(1).max(200),
  MAX_INGEST_BODY_BYTES: z.coerce.number().int().min(1024).max(5242880),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, unknown>): AppEnv {
  return envSchema.parse(input);
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= parseEnv(process.env);

  return cachedEnv;
}

export const env = new Proxy({} as AppEnv, {
  get(_target, property) {
    return getEnv()[property as keyof AppEnv];
  },
});
