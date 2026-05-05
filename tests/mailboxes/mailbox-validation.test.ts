import { describe, expect, it } from "vitest";
import { buildMailboxAddress, validateLocalPart } from "@/lib/validation/mailbox";

describe("validateLocalPart", () => {
  it("accepts lowercase letters, digits, and hyphens", () => {
    expect(validateLocalPart("user-123")).toEqual({ ok: true, value: "user-123" });
  });

  it("normalizes uppercase input", () => {
    expect(validateLocalPart("User-123")).toEqual({ ok: true, value: "user-123" });
  });

  it("rejects reserved local parts", () => {
    expect(validateLocalPart("admin")).toEqual({
      ok: false,
      error: "This address name is reserved.",
    });
  });

  it("rejects invalid characters", () => {
    expect(validateLocalPart("bad.name")).toEqual({
      ok: false,
      error: "Use lowercase letters, numbers, and hyphens only.",
    });
  });
});

describe("buildMailboxAddress", () => {
  it("builds a full address", () => {
    expect(buildMailboxAddress("user-123", "example.com")).toBe("user-123@example.com");
  });
});
