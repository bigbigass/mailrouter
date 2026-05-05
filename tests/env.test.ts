import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/lib/env";

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
        MAX_ACTIVE_MAILBOXES_PER_USER: "5",
        MAX_INGEST_BODY_BYTES: "1048576",
      }),
    ).toThrow();
  });
});

describe("env", () => {
  it("does not parse process.env on import", async () => {
    vi.resetModules();
    process.env = { NODE_ENV: "test" };

    await expect(import("@/lib/env")).resolves.toHaveProperty("env");
  });

  it("throws when env is accessed with invalid process.env", async () => {
    vi.resetModules();
    process.env = { NODE_ENV: "test" };
    const { env } = await import("@/lib/env");

    expect(() => env.SESSION_SECRET).toThrow();
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
