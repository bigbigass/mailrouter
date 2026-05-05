import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("session utilities", () => {
  const secret = "s".repeat(32);

  it("creates and verifies a session token", async () => {
    const token = await createSessionToken({ userId: "user_1", role: "USER" }, secret);
    const payload = await verifySessionToken(token, secret);

    expect(payload).toEqual({ userId: "user_1", role: "USER" });
  });

  it("rejects invalid tokens", async () => {
    await expect(verifySessionToken("bad-token", secret)).resolves.toBeNull();
  });
});
