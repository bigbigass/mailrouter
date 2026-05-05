import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMailbox, disableMailbox } from "@/lib/mailboxes/mailbox-service";

const db = {
  mailbox: {
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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

describe("disableMailbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a mailbox disabled after disabling the Cloudflare rule", async () => {
    db.mailbox.findUnique.mockResolvedValue({
      id: "mailbox_1",
      userId: "user_1",
      address: "user@example.com",
      cloudflareRuleId: "rule_123",
    });
    cloudflare.disableRule.mockResolvedValue(undefined);
    db.mailbox.update
      .mockResolvedValueOnce({ id: "mailbox_1", status: "DISABLING" })
      .mockResolvedValueOnce({ id: "mailbox_1", status: "DISABLED" });

    const result = await disableMailbox({
      userId: "user_1",
      mailboxId: "mailbox_1",
      db,
      cloudflare,
    });

    expect(result).toEqual({ id: "mailbox_1", status: "DISABLED" });
    expect(cloudflare.disableRule).toHaveBeenCalledWith("rule_123");
    expect(db.mailbox.update).toHaveBeenNthCalledWith(1, {
      where: { id: "mailbox_1" },
      data: { status: "DISABLING" },
    });
    expect(db.mailbox.update).toHaveBeenNthCalledWith(2, {
      where: { id: "mailbox_1" },
      data: expect.objectContaining({ status: "DISABLED" }),
    });
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "MAILBOX_DISABLED" }),
      }),
    );
  });

  it("rejects mailboxes owned by another user", async () => {
    db.mailbox.findUnique.mockResolvedValue({
      id: "mailbox_1",
      userId: "other_user",
      address: "user@example.com",
      cloudflareRuleId: "rule_123",
    });

    await expect(
      disableMailbox({
        userId: "user_1",
        mailboxId: "mailbox_1",
        db,
        cloudflare,
      }),
    ).rejects.toThrow("Mailbox not found.");

    expect(db.mailbox.update).not.toHaveBeenCalled();
    expect(cloudflare.disableRule).not.toHaveBeenCalled();
  });

  it("keeps the mailbox disabling and audits when Cloudflare disablement fails", async () => {
    db.mailbox.findUnique.mockResolvedValue({
      id: "mailbox_1",
      userId: "user_1",
      address: "user@example.com",
      cloudflareRuleId: "rule_123",
    });
    cloudflare.disableRule.mockRejectedValue(new Error("Cloudflare failed"));
    db.mailbox.update.mockResolvedValue({ id: "mailbox_1", status: "DISABLING" });

    await expect(
      disableMailbox({
        userId: "user_1",
        mailboxId: "mailbox_1",
        db,
        cloudflare,
      }),
    ).rejects.toThrow("Mailbox disablement failed.");

    expect(db.mailbox.update).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "MAILBOX_DISABLE_FAILED" }),
      }),
    );
  });
});
