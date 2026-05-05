import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { ingestEmailMessage } from "@/lib/email/ingest-service";
import { verifyIngestSignature } from "@/lib/email/ingest-signature";

vi.mock("@/lib/env", () => ({
  env: {
    INGEST_SECRET: "i".repeat(32),
    MAX_INGEST_BODY_BYTES: 512,
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/email/ingest-signature", () => ({
  verifyIngestSignature: vi.fn(),
}));

vi.mock("@/lib/email/ingest-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/ingest-service")>();

  return {
    ...actual,
    ingestEmailMessage: vi.fn(),
  };
});

describe("email ingest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects oversized payloads before signature validation", async () => {
    const { POST } = await import("@/app/api/email/ingest/route");

    const response = await POST(ingestRequest("x".repeat(513)));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Payload too large." });
    expect(verifyIngestSignature).not.toHaveBeenCalled();
  });

  it("audits and rejects invalid signatures", async () => {
    vi.mocked(verifyIngestSignature).mockResolvedValue(false);
    const { POST } = await import("@/app/api/email/ingest/route");

    const response = await POST(ingestRequest(validBody()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "INGEST_SIGNATURE_FAILED" }),
      }),
    );
  });

  it("rejects invalid JSON after signature validation", async () => {
    vi.mocked(verifyIngestSignature).mockResolvedValue(true);
    const { POST } = await import("@/app/api/email/ingest/route");

    const response = await POST(ingestRequest("{bad json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid ingest payload." });
    expect(ingestEmailMessage).not.toHaveBeenCalled();
  });

  it("returns 202 for unknown recipients", async () => {
    vi.mocked(verifyIngestSignature).mockResolvedValue(true);
    vi.mocked(ingestEmailMessage).mockResolvedValue({
      stored: false,
      reason: "unknown_recipient",
    });
    const { POST } = await import("@/app/api/email/ingest/route");

    const response = await POST(ingestRequest(validBody()));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      stored: false,
      reason: "unknown_recipient",
    });
  });

  it("returns 201 for stored messages", async () => {
    vi.mocked(verifyIngestSignature).mockResolvedValue(true);
    vi.mocked(ingestEmailMessage).mockResolvedValue({
      stored: true,
      messageId: "message_1",
    });
    const { POST } = await import("@/app/api/email/ingest/route");

    const response = await POST(ingestRequest(validBody()));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      stored: true,
      messageId: "message_1",
    });
    expect(ingestEmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        db: prisma,
        payload: expect.objectContaining({ toAddress: "user@example.com" }),
      }),
    );
  });
});

function ingestRequest(body: string): Request {
  return new Request("http://localhost/api/email/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ingest-timestamp": "2026-05-05T12:00:00.000Z",
      "x-ingest-signature": "signature",
    },
    body,
  });
}

function validBody(): string {
  return JSON.stringify({
    toAddress: "user@example.com",
    fromAddress: "sender@example.net",
    subject: "Your verification code",
    textBody: "Use code 123456.",
    htmlBody: null,
    messageId: "message-id",
    receivedAt: "2026-05-05T12:00:00.000Z",
    rawSize: 1024,
  });
}
