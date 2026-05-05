import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("parses valid environment variables", () => {
    const env = parseEnv({
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
    });

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
