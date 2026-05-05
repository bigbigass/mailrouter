import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMailbox } from "@/lib/mailboxes/mailbox-service";

const db = {
  mailbox: {
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

const cloudflare = {
  createWorkerRule: vi.fn(),
  disableRule: vi.fn(),
};

describe("createMailbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a mailbox after creating the Cloudflare rule", async () => {
    db.mailbox.count.mockResolvedValue(0);
    db.mailbox.findUnique.mockResolvedValue(null);
    cloudflare.createWorkerRule.mockResolvedValue({ id: "rule_123" });
    db.mailbox.create.mockResolvedValue({
      id: "mailbox_1",
      address: "user-123@example.com",
      cloudflareRuleId: "rule_123",
    });

    const mailbox = await createMailbox({
      userId: "user_1",
      requestedLocalPart: "User-123",
      domain: "Example.COM",
      maxActiveMailboxes: 5,
      workerName: "email-worker",
      db,
      cloudflare,
    });

    expect(mailbox.address).toBe("user-123@example.com");
    expect(cloudflare.createWorkerRule).toHaveBeenCalledWith({
      address: "user-123@example.com",
      workerName: "email-worker",
    });
    expect(db.mailbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          localPart: "user-123",
          domain: "example.com",
          address: "user-123@example.com",
          cloudflareRuleId: "rule_123",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("rejects when the user has reached quota", async () => {
    db.mailbox.count.mockResolvedValue(5);

    await expect(
      createMailbox({
        userId: "user_1",
        requestedLocalPart: "user-123",
        domain: "example.com",
        maxActiveMailboxes: 5,
        workerName: "email-worker",
        db,
        cloudflare,
      }),
    ).rejects.toThrow("Mailbox quota reached.");

    expect(cloudflare.createWorkerRule).not.toHaveBeenCalled();
    expect(db.mailbox.create).not.toHaveBeenCalled();
  });

  it("rejects when the address already exists", async () => {
    db.mailbox.count.mockResolvedValue(0);
    db.mailbox.findUnique.mockResolvedValue({ id: "existing" });

    await expect(
      createMailbox({
        userId: "user_1",
        requestedLocalPart: "user-123",
        domain: "example.com",
        maxActiveMailboxes: 5,
        workerName: "email-worker",
        db,
        cloudflare,
      }),
    ).rejects.toThrow("Address is unavailable.");

    expect(cloudflare.createWorkerRule).not.toHaveBeenCalled();
    expect(db.mailbox.create).not.toHaveBeenCalled();
  });

  it("does not write an active mailbox when Cloudflare fails", async () => {
    db.mailbox.count.mockResolvedValue(0);
    db.mailbox.findUnique.mockResolvedValue(null);
    cloudflare.createWorkerRule.mockRejectedValue(new Error("Cloudflare failed"));

    await expect(
      createMailbox({
        userId: "user_1",
        requestedLocalPart: "user-123",
        domain: "example.com",
        maxActiveMailboxes: 5,
        workerName: "email-worker",
        db,
        cloudflare,
      }),
    ).rejects.toThrow("Mailbox creation failed.");

    expect(db.mailbox.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "MAILBOX_CREATE_FAILED" }),
      }),
    );
  });

  it("attempts to remove the Cloudflare rule when database creation fails", async () => {
    db.mailbox.count.mockResolvedValue(0);
    db.mailbox.findUnique.mockResolvedValue(null);
    cloudflare.createWorkerRule.mockResolvedValue({ id: "rule_123" });
    db.mailbox.create.mockRejectedValue(new Error("database down"));

    await expect(
      createMailbox({
        userId: "user_1",
        requestedLocalPart: "user-123",
        domain: "example.com",
        maxActiveMailboxes: 5,
        workerName: "email-worker",
        db,
        cloudflare,
      }),
    ).rejects.toThrow("Mailbox creation failed.");

    expect(cloudflare.disableRule).toHaveBeenCalledWith("rule_123");
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "MAILBOX_CREATE_FAILED",
          metadata: expect.objectContaining({ ruleId: "rule_123" }),
        }),
      }),
    );
  });
});
