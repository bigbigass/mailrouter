import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestEmailMessage } from "@/lib/email/ingest-service";

const db = {
  mailbox: {
    findUnique: vi.fn(),
  },
  message: {
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

describe("ingestEmailMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a message and extracted code for an active mailbox", async () => {
    db.mailbox.findUnique.mockResolvedValue({
      id: "mailbox_1",
      address: "user@example.com",
      status: "ACTIVE",
      userId: "user_1",
    });
    db.message.create.mockResolvedValue({ id: "message_1" });

    const result = await ingestEmailMessage({
      db,
      payload: {
        toAddress: "USER@Example.COM",
        fromAddress: "sender@example.net",
        subject: "Your verification code",
        textBody: "Use code 123456 to continue.",
        htmlBody: null,
        messageId: "message-id",
        receivedAt: "2026-05-05T12:00:00.000Z",
        rawSize: 1024,
      },
    });

    expect(result).toEqual({ stored: true, messageId: "message_1" });
    expect(db.mailbox.findUnique).toHaveBeenCalledWith({
      where: { address: "user@example.com" },
    });
    expect(db.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mailboxId: "mailbox_1",
          toAddress: "user@example.com",
          receivedAt: new Date("2026-05-05T12:00:00.000Z"),
          verificationCodes: {
            create: [expect.objectContaining({ code: "123456" })],
          },
        }),
      }),
    );
  });

  it("stores messages with no verification candidates", async () => {
    db.mailbox.findUnique.mockResolvedValue({
      id: "mailbox_1",
      address: "user@example.com",
      status: "ACTIVE",
      userId: "user_1",
    });
    db.message.create.mockResolvedValue({ id: "message_1" });

    const result = await ingestEmailMessage({
      db,
      payload: {
        toAddress: "user@example.com",
        fromAddress: "sender@example.net",
        subject: "Newsletter",
        textBody: "No login code here.",
        htmlBody: "<p>No login code here.</p>",
        messageId: null,
        receivedAt: "2026-05-05T12:00:00.000Z",
        rawSize: 1024,
      },
    });

    expect(result).toEqual({ stored: true, messageId: "message_1" });
    expect(db.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          verificationCodes: { create: [] },
        }),
      }),
    );
  });

  it("rejects unknown recipients", async () => {
    db.mailbox.findUnique.mockResolvedValue(null);

    const result = await ingestEmailMessage({
      db,
      payload: {
        toAddress: "missing@example.com",
        fromAddress: "sender@example.net",
        subject: "Code",
        textBody: "123456",
        htmlBody: null,
        messageId: null,
        receivedAt: "2026-05-05T12:00:00.000Z",
        rawSize: 1024,
      },
    });

    expect(result).toEqual({ stored: false, reason: "unknown_recipient" });
    expect(db.message.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          eventType: "INGEST_UNKNOWN_RECIPIENT",
        }),
      }),
    );
  });

  it("rejects inactive recipients", async () => {
    db.mailbox.findUnique.mockResolvedValue({
      id: "mailbox_1",
      address: "user@example.com",
      status: "DISABLED",
      userId: "user_1",
    });

    const result = await ingestEmailMessage({
      db,
      payload: {
        toAddress: "user@example.com",
        fromAddress: "sender@example.net",
        subject: "Code",
        textBody: "Use code 123456.",
        htmlBody: null,
        messageId: null,
        receivedAt: "2026-05-05T12:00:00.000Z",
        rawSize: 1024,
      },
    });

    expect(result).toEqual({ stored: false, reason: "unknown_recipient" });
    expect(db.message.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          eventType: "INGEST_UNKNOWN_RECIPIENT",
        }),
      }),
    );
  });
});
