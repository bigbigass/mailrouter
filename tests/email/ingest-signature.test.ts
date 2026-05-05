import { describe, expect, it } from "vitest";
import { createIngestSignature, verifyIngestSignature } from "@/lib/email/ingest-signature";

describe("ingest signatures", () => {
  const secret = "i".repeat(32);
  const body = JSON.stringify({ to: "user@example.com" });

  it("verifies a valid signature", async () => {
    const timestamp = new Date().toISOString();
    const signature = await createIngestSignature({ timestamp, body, secret });

    await expect(
      verifyIngestSignature({
        timestamp,
        body,
        secret,
        signature,
        now: new Date(timestamp),
      }),
    ).resolves.toBe(true);
  });

  it("rejects an expired timestamp", async () => {
    const timestamp = "2026-05-05T00:00:00.000Z";
    const signature = await createIngestSignature({ timestamp, body, secret });

    await expect(
      verifyIngestSignature({
        timestamp,
        body,
        secret,
        signature,
        now: new Date("2026-05-05T00:06:01.000Z"),
      }),
    ).resolves.toBe(false);
  });

  it("rejects a timestamp too far in the future", async () => {
    const timestamp = "2026-05-05T00:06:01.000Z";
    const signature = await createIngestSignature({ timestamp, body, secret });

    await expect(
      verifyIngestSignature({
        timestamp,
        body,
        secret,
        signature,
        now: new Date("2026-05-05T00:00:00.000Z"),
      }),
    ).resolves.toBe(false);
  });

  it("rejects tampered bodies", async () => {
    const timestamp = "2026-05-05T00:00:00.000Z";
    const signature = await createIngestSignature({ timestamp, body, secret });

    await expect(
      verifyIngestSignature({
        timestamp,
        body: JSON.stringify({ to: "attacker@example.com" }),
        secret,
        signature,
        now: new Date(timestamp),
      }),
    ).resolves.toBe(false);
  });

  it("rejects malformed signatures and timestamps", async () => {
    await expect(
      verifyIngestSignature({
        timestamp: "not-a-date",
        body,
        secret,
        signature: "not-hex",
        now: new Date("2026-05-05T00:00:00.000Z"),
      }),
    ).resolves.toBe(false);
  });
});
