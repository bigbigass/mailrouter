import { describe, expect, it } from "vitest";
import {
  buildMailboxAddress,
  normalizeDomain,
  validateLocalPart,
} from "@/lib/validation/mailbox";

describe("validateLocalPart", () => {
  it("accepts lowercase letters, digits, and hyphens", () => {
    expect(validateLocalPart("user-123")).toEqual({ ok: true, value: "user-123" });
  });

  it("trims local parts", () => {
    expect(validateLocalPart(" user-123 ")).toEqual({ ok: true, value: "user-123" });
  });

  it("normalizes uppercase input", () => {
    expect(validateLocalPart("User-123")).toEqual({ ok: true, value: "user-123" });
  });

  it("rejects too short local parts", () => {
    expect(validateLocalPart("ab")).toEqual({
      ok: false,
      error: "Use 3 to 32 characters.",
    });
  });

  it("accepts 32 character local parts", () => {
    expect(validateLocalPart("a".repeat(32))).toEqual({
      ok: true,
      value: "a".repeat(32),
    });
  });

  it("rejects 33 character local parts", () => {
    expect(validateLocalPart("a".repeat(33))).toEqual({
      ok: false,
      error: "Use 3 to 32 characters.",
    });
  });

  it("rejects reserved local parts", () => {
    expect(validateLocalPart("admin")).toEqual({
      ok: false,
      error: "This address name is reserved.",
    });
  });

  it("rejects reserved local parts after normalization", () => {
    expect(validateLocalPart(" Admin ")).toEqual({
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

  it("rejects leading hyphens", () => {
    expect(validateLocalPart("-user")).toEqual({
      ok: false,
      error: "Hyphens cannot start, end, or repeat.",
    });
  });

  it("rejects trailing hyphens", () => {
    expect(validateLocalPart("user-")).toEqual({
      ok: false,
      error: "Hyphens cannot start, end, or repeat.",
    });
  });

  it("rejects repeated hyphens", () => {
    expect(validateLocalPart("user--123")).toEqual({
      ok: false,
      error: "Hyphens cannot start, end, or repeat.",
    });
  });

  it("rejects whitespace-only input", () => {
    expect(validateLocalPart("   ")).toEqual({
      ok: false,
      error: "Use 3 to 32 characters.",
    });
  });
});

describe("normalizeDomain", () => {
  it("normalizes domain casing and whitespace", () => {
    expect(normalizeDomain(" Example.COM ")).toBe("example.com");
  });
});

describe("buildMailboxAddress", () => {
  it("builds a full address", () => {
    expect(buildMailboxAddress("user-123", "example.com")).toBe("user-123@example.com");
  });

  it("normalizes domain casing and whitespace", () => {
    expect(buildMailboxAddress("user-123", " Example.COM ")).toBe("user-123@example.com");
  });
});
