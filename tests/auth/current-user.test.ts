import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/auth/session";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { SESSION_SECRET: "s".repeat(32) },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();

  return {
    ...actual,
    verifySessionToken: vi.fn(),
  };
});

describe("getCurrentUser", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { cookies } = await import("next/headers");
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "session-token" }),
    } as never);
  });

  it("returns the active user for a valid session cookie", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({ userId: "user_1", role: "USER" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      role: "USER",
      disabledAt: null,
    } as never);

    await expect(getCurrentUser()).resolves.toEqual({
      id: "user_1",
      email: "user@example.com",
      role: "USER",
      disabledAt: null,
    });
  });

  it("returns null when the session is missing or invalid", async () => {
    const { cookies } = await import("next/headers");
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as never);

    await expect(getCurrentUser()).resolves.toBeNull();

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "session-token" }),
    } as never);
    vi.mocked(verifySessionToken).mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns null for disabled users", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({ userId: "user_1", role: "USER" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      role: "USER",
      disabledAt: new Date("2026-05-05T00:00:00.000Z"),
    } as never);

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
