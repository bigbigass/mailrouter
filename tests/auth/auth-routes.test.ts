import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/env", () => ({
  env: { SESSION_SECRET: "s".repeat(32) },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();

  return {
    ...actual,
    createSessionToken: vi.fn(),
    sessionCookieOptions: vi.fn(() => ({
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false,
      path: "/",
      maxAge: 604800,
    })),
  };
});

describe("auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSessionToken).mockResolvedValue("session-token");
    vi.mocked(hashPassword).mockResolvedValue("hashed-password");
  });

  it("registers a new user and sets the session cookie", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      role: "USER",
    } as never);
    const { POST } = await import("@/app/api/auth/register/route");

    const response = await POST(jsonRequest("/api/auth/register", {
      email: "User@Example.COM",
      password: "correct horse",
    }));

    await expect(response.json()).resolves.toEqual({
      user: { id: "user_1", email: "user@example.com", role: "USER" },
    });
    expect(response.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("correct horse");
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "user@example.com" }),
      }),
    );
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=session-token`);
  });

  it("rejects duplicate registration emails", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      passwordHash: "hashed-password",
      role: "USER",
      createdAt: new Date("2026-05-05T00:00:00.000Z"),
      disabledAt: null,
    });
    const { POST } = await import("@/app/api/auth/register/route");

    const response = await POST(jsonRequest("/api/auth/register", {
      email: "user@example.com",
      password: "correct horse",
    }));

    await expect(response.json()).resolves.toEqual({ error: "Email is already registered." });
    expect(response.status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("logs in an active user and sets the session cookie", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      passwordHash: "hashed-password",
      role: "USER",
      createdAt: new Date("2026-05-05T00:00:00.000Z"),
      disabledAt: null,
    });
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const { POST } = await import("@/app/api/auth/login/route");

    const response = await POST(jsonRequest("/api/auth/login", {
      email: "USER@example.com",
      password: "correct horse",
    }));

    await expect(response.json()).resolves.toEqual({
      user: { id: "user_1", email: "user@example.com", role: "USER" },
    });
    expect(response.status).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith("correct horse", "hashed-password");
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=session-token`);
  });

  it("audits failed login attempts", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      passwordHash: "hashed-password",
      role: "USER",
      createdAt: new Date("2026-05-05T00:00:00.000Z"),
      disabledAt: null,
    });
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const { POST } = await import("@/app/api/auth/login/route");

    const response = await POST(jsonRequest("/api/auth/login", {
      email: "user@example.com",
      password: "wrong password",
    }));

    await expect(response.json()).resolves.toEqual({ error: "Invalid email or password." });
    expect(response.status).toBe(401);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "LOGIN_FAILED", userId: "user_1" }),
      }),
    );
  });

  it("clears the session cookie on logout", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");

    const response = await POST();

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
