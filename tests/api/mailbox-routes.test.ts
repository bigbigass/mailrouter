import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { createMailbox, disableMailbox } from "@/lib/mailboxes/mailbox-service";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    CLOUDFLARE_API_TOKEN: "token",
    CLOUDFLARE_ZONE_ID: "zone",
    EMAIL_DOMAIN: "example.com",
    EMAIL_WORKER_NAME: "email-worker",
    MAX_ACTIVE_MAILBOXES_PER_USER: 5,
  },
}));

vi.mock("@/lib/cloudflare/email-routing-client", () => ({
  CloudflareEmailRoutingClient: vi.fn(function CloudflareEmailRoutingClient(options) {
    return { options };
  }),
}));

vi.mock("@/lib/mailboxes/mailbox-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mailboxes/mailbox-service")>();

  return {
    ...actual,
    createMailbox: vi.fn(),
    disableMailbox: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    mailbox: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe("mailbox and message routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      role: "USER",
      disabledAt: null,
    });
  });

  it("requires authentication for mailbox listing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { GET } = await import("@/app/api/mailboxes/route");

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("lists the current user's mailboxes", async () => {
    vi.mocked(prisma.mailbox.findMany).mockResolvedValue([{ id: "mailbox_1" }] as never);
    const { GET } = await import("@/app/api/mailboxes/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mailboxes: [{ id: "mailbox_1" }] });
    expect(prisma.mailbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" } }),
    );
  });

  it("creates a mailbox for the current user", async () => {
    vi.mocked(createMailbox).mockResolvedValue({
      id: "mailbox_1",
      address: "user@example.com",
      cloudflareRuleId: "rule_123",
    });
    const { POST } = await import("@/app/api/mailboxes/route");

    const response = await POST(jsonRequest("/api/mailboxes", { localPart: "User" }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      mailbox: {
        id: "mailbox_1",
        address: "user@example.com",
        cloudflareRuleId: "rule_123",
      },
    });
    expect(createMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        requestedLocalPart: "User",
        domain: "example.com",
        maxActiveMailboxes: 5,
        workerName: "email-worker",
      }),
    );
  });

  it("returns mailbox details only for the current user", async () => {
    vi.mocked(prisma.mailbox.findFirst).mockResolvedValue({ id: "mailbox_1" } as never);
    const { GET } = await import("@/app/api/mailboxes/[id]/route");

    const response = await GET(new Request("http://localhost/api/mailboxes/mailbox_1"), {
      params: Promise.resolve({ id: "mailbox_1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mailbox: { id: "mailbox_1" } });
    expect(prisma.mailbox.findFirst).toHaveBeenCalledWith({
      where: { id: "mailbox_1", userId: "user_1" },
    });
  });

  it("disables a mailbox through the service", async () => {
    vi.mocked(disableMailbox).mockResolvedValue({ id: "mailbox_1", status: "DISABLED" });
    const { PATCH } = await import("@/app/api/mailboxes/[id]/route");

    const response = await PATCH(new Request("http://localhost/api/mailboxes/mailbox_1"), {
      params: Promise.resolve({ id: "mailbox_1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mailbox: { id: "mailbox_1", status: "DISABLED" },
    });
    expect(disableMailbox).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", mailboxId: "mailbox_1" }),
    );
  });

  it("lists messages after checking mailbox ownership", async () => {
    vi.mocked(prisma.mailbox.findFirst).mockResolvedValue({ id: "mailbox_1" } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: "message_1" }] as never);
    const { GET } = await import("@/app/api/mailboxes/[id]/messages/route");

    const response = await GET(new Request("http://localhost/api/mailboxes/mailbox_1/messages"), {
      params: Promise.resolve({ id: "mailbox_1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ messages: [{ id: "message_1" }] });
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mailboxId: "mailbox_1" } }),
    );
  });

  it("returns message details only when owned by the current user", async () => {
    vi.mocked(prisma.message.findFirst).mockResolvedValue({ id: "message_1" } as never);
    const { GET } = await import("@/app/api/messages/[id]/route");

    const response = await GET(new Request("http://localhost/api/messages/message_1"), {
      params: Promise.resolve({ id: "message_1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: { id: "message_1" } });
    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "message_1", mailbox: { userId: "user_1" } },
      }),
    );
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
