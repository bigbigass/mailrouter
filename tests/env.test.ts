import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDatabaseUrl, configToEnv, parseConfig, parseEnv } from "@/lib/env";

const originalEnv = process.env;

function validProcessEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/email_app",
    APP_BASE_URL: "https://app.example.com",
    SESSION_SECRET: "a".repeat(32),
    INGEST_SECRET: "b".repeat(32),
    CLOUDFLARE_API_TOKEN: "token",
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_ZONE_ID: "zone",
    EMAIL_DOMAIN: "example.com",
    EMAIL_WORKER_NAME: "email-worker",
    WORKER_APP_INGEST_URL: "https://app.example.com/api/email/ingest",
    MAX_ACTIVE_MAILBOXES_PER_USER: "5",
    MAX_INGEST_BODY_BYTES: "1048576",
  };
}

afterEach(() => {
  process.env = originalEnv;
  vi.resetModules();
});

describe("parseEnv", () => {
  it("parses valid environment variables", () => {
    const env = parseEnv(validProcessEnv());

    expect(env.EMAIL_DOMAIN).toBe("example.com");
    expect(env.MAX_ACTIVE_MAILBOXES_PER_USER).toBe(5);
  });

  it("parses Cloudflare runtime variables without DATABASE_URL", () => {
    const { DATABASE_URL: _databaseUrl, ...cloudflareEnv } = validProcessEnv();

    const env = parseEnv(cloudflareEnv);

    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.EMAIL_WORKER_NAME).toBe("email-worker");
  });

  it("rejects short secrets", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/email_app",
        APP_BASE_URL: "https://app.example.com",
        SESSION_SECRET: "short",
        INGEST_SECRET: "b".repeat(32),
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_ZONE_ID: "zone",
        EMAIL_DOMAIN: "example.com",
        EMAIL_WORKER_NAME: "email-worker",
        WORKER_APP_INGEST_URL: "https://app.example.com/api/email/ingest",
        MAX_ACTIVE_MAILBOXES_PER_USER: "5",
        MAX_INGEST_BODY_BYTES: "1048576",
      }),
    ).toThrow();
  });
});

describe("parseConfig", () => {
  it("maps local config into app env", () => {
    const config = parseConfig({
      app: { baseUrl: "https://app.example.com" },
      database: {
        host: "db.example.com",
        port: 5432,
        name: "email_app",
        schema: "public",
        user: "email_user",
        password: "secret password",
        ssl: true,
      },
      security: {
        sessionSecret: "a".repeat(32),
        ingestSecret: "b".repeat(32),
      },
      cloudflare: {
        apiToken: "token",
        accountId: "account",
        zoneId: "zone",
        emailDomain: "Example.COM",
        workerName: "email-worker",
      },
      limits: {
        maxActiveMailboxesPerUser: 5,
        maxIngestBodyBytes: 1048576,
      },
      worker: {
        appIngestUrl: "https://app.example.com/api/email/ingest",
      },
    });

    expect(configToEnv(config)).toMatchObject({
      APP_BASE_URL: "https://app.example.com",
      DATABASE_URL:
        "postgresql://email_user:secret%20password@db.example.com:5432/email_app?schema=public&sslmode=require",
      EMAIL_DOMAIN: "example.com",
      EMAIL_WORKER_NAME: "email-worker",
      WORKER_APP_INGEST_URL: "https://app.example.com/api/email/ingest",
    });
  });

  it("builds database URLs with encoded credentials", () => {
    expect(
      buildDatabaseUrl({
        host: "localhost",
        port: 5432,
        name: "email_app",
        schema: "public",
        user: "email user",
        password: "p@ss word",
        ssl: false,
      }),
    ).toBe("postgresql://email%20user:p%40ss%20word@localhost:5432/email_app?schema=public");
  });
});

describe("env", () => {
  it("does not parse process.env on import", async () => {
    vi.resetModules();
    process.env = { NODE_ENV: "test" };

    await expect(import("@/lib/env")).resolves.toHaveProperty("env");
  });

  it("falls back to config when process.env is incomplete", async () => {
    vi.resetModules();
    process.env = { NODE_ENV: "test" };
    const { env } = await import("@/lib/env");

    expect(env.SESSION_SECRET).toBe("local-session-secret-value-32-chars");
  });

  it("returns coerced numbers when env is accessed with valid process.env", async () => {
    vi.resetModules();
    process.env = validProcessEnv();
    const { env } = await import("@/lib/env");

    expect(env.MAX_ACTIVE_MAILBOXES_PER_USER).toBe(5);
  });
});

describe("db", () => {
  it("does not initialize Prisma on import", async () => {
    vi.resetModules();

    await expect(import("@/lib/db")).resolves.toHaveProperty("prisma");
  });
});
