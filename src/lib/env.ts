import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  APP_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  INGEST_SECRET: z.string().min(32),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_ZONE_ID: z.string().min(1),
  EMAIL_DOMAIN: z.preprocess(
    (value) => (typeof value === "string" ? value.toLowerCase() : value),
    z.string().min(3).regex(/^[a-z0-9.-]+$/),
  ),
  EMAIL_WORKER_NAME: z.string().min(1).default("email-worker"),
  WORKER_APP_INGEST_URL: z.string().url(),
  MAX_ACTIVE_MAILBOXES_PER_USER: z.coerce.number().int().min(1).max(200),
  MAX_INGEST_BODY_BYTES: z.coerce.number().int().min(1024).max(5242880),
});

const sqliteDatabaseConfigSchema = z.object({
  url: z.string().min(1),
});

const postgresDatabaseConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  name: z.string().min(1),
  schema: z.string().min(1).default("public"),
  user: z.string().min(1),
  password: z.string(),
  ssl: z.boolean().default(false),
});

const databaseConfigSchema = z.union([sqliteDatabaseConfigSchema, postgresDatabaseConfigSchema]);

const configSchema = z.object({
  app: z.object({
    baseUrl: z.string().url(),
  }),
  database: databaseConfigSchema,
  security: z.object({
    sessionSecret: z.string().min(32),
    ingestSecret: z.string().min(32),
  }),
  cloudflare: z.object({
    apiToken: z.string().min(1),
    accountId: z.string().min(1),
    zoneId: z.string().min(1),
    emailDomain: z.string().min(3).regex(/^[a-z0-9.-]+$/),
    workerName: z.string().min(1).default("email-worker"),
  }),
  limits: z.object({
    maxActiveMailboxesPerUser: z.coerce.number().int().min(1).max(200),
    maxIngestBodyBytes: z.coerce.number().int().min(1024).max(5242880),
  }),
  worker: z.object({
    appIngestUrl: z.string().url(),
  }),
});

export type AppEnv = z.infer<typeof envSchema>;
export type AppConfig = z.infer<typeof configSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export function parseEnv(input: Record<string, unknown>): AppEnv {
  return envSchema.parse(input);
}

export function parseConfig(input: unknown): AppConfig {
  return configSchema.parse(normalizeConfigInput(input));
}

export function configToEnv(config: AppConfig): AppEnv {
  return parseEnv({
    DATABASE_URL: buildDatabaseUrl(config.database),
    APP_BASE_URL: config.app.baseUrl,
    SESSION_SECRET: config.security.sessionSecret,
    INGEST_SECRET: config.security.ingestSecret,
    CLOUDFLARE_API_TOKEN: config.cloudflare.apiToken,
    CLOUDFLARE_ACCOUNT_ID: config.cloudflare.accountId,
    CLOUDFLARE_ZONE_ID: config.cloudflare.zoneId,
    EMAIL_DOMAIN: config.cloudflare.emailDomain,
    EMAIL_WORKER_NAME: config.cloudflare.workerName,
    WORKER_APP_INGEST_URL: config.worker.appIngestUrl,
    MAX_ACTIVE_MAILBOXES_PER_USER: config.limits.maxActiveMailboxesPerUser,
    MAX_INGEST_BODY_BYTES: config.limits.maxIngestBodyBytes,
  });
}

export function buildDatabaseUrl(database: DatabaseConfig): string {
  if ("url" in database) {
    return database.url;
  }

  const user = encodeURIComponent(database.user);
  const password = encodeURIComponent(database.password);
  const name = encodeURIComponent(database.name);
  const schema = encodeURIComponent(database.schema);
  const sslMode = database.ssl ? "&sslmode=require" : "";

  return `postgresql://${user}:${password}@${database.host}:${database.port}/${name}?schema=${schema}${sslMode}`;
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= loadEnv(process.env);

  return cachedEnv;
}

function loadEnv(processEnv: NodeJS.ProcessEnv): AppEnv {
  const configEnv = processEnv.APP_RUNTIME === "cloudflare" ? {} : loadConfigEnv();
  const merged = {
    ...configEnv,
    ...removeUndefined({
      DATABASE_URL: processEnv.DATABASE_URL,
      APP_BASE_URL: processEnv.APP_BASE_URL,
      SESSION_SECRET: processEnv.SESSION_SECRET,
      INGEST_SECRET: processEnv.INGEST_SECRET,
      CLOUDFLARE_API_TOKEN: processEnv.CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: processEnv.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_ZONE_ID: processEnv.CLOUDFLARE_ZONE_ID,
      EMAIL_DOMAIN: processEnv.EMAIL_DOMAIN,
      EMAIL_WORKER_NAME: processEnv.EMAIL_WORKER_NAME,
      WORKER_APP_INGEST_URL: processEnv.WORKER_APP_INGEST_URL,
      MAX_ACTIVE_MAILBOXES_PER_USER: processEnv.MAX_ACTIVE_MAILBOXES_PER_USER,
      MAX_INGEST_BODY_BYTES: processEnv.MAX_INGEST_BODY_BYTES,
    }),
  };

  return parseEnv(merged);
}

function loadConfigEnv(): Partial<AppEnv> {
  const configPath = join(process.cwd(), "config", "app.config.json");

  if (!existsSync(configPath)) {
    return {};
  }

  const rawConfig = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  return configToEnv(parseConfig(rawConfig));
}

function normalizeConfigInput(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }

  const config = input as {
    cloudflare?: Record<string, unknown>;
  };

  if (config.cloudflare && typeof config.cloudflare.emailDomain === "string") {
    return {
      ...(input as Record<string, unknown>),
      cloudflare: {
        ...config.cloudflare,
        emailDomain: config.cloudflare.emailDomain.toLowerCase(),
      },
    };
  }

  return input;
}

function removeUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [keyof T & string, unknown] => entry[1] !== undefined),
  ) as Partial<T>;
}

export const env = new Proxy({} as AppEnv, {
  get(_target, property) {
    return getEnv()[property as keyof AppEnv];
  },
});
