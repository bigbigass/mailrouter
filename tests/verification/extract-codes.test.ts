import { describe, expect, it } from "vitest";
import { extractVerificationCodes } from "@/lib/verification/extract-codes";

describe("extractVerificationCodes", () => {
  it("extracts a Chinese verification code", () => {
    const codes = extractVerificationCodes({
      subject: "登录验证码",
      textBody: "您的验证码是 438921，请在 10 分钟内使用。",
    });

    expect(codes[0]).toMatchObject({ code: "438921" });
    expect(codes[0].confidence).toBeGreaterThanOrEqual(90);
  });

  it("extracts an English OTP code", () => {
    const codes = extractVerificationCodes({
      subject: "Your verification code",
      textBody: "Use verification code 827364 to continue.",
    });

    expect(codes[0]).toMatchObject({ code: "827364" });
  });

  it("prefers code context over an order number", () => {
    const codes = extractVerificationCodes({
      subject: "Receipt 123456",
      textBody: "Order 123456 is paid. Your login code is 991244.",
    });

    expect(codes[0].code).toBe("991244");
  });

  it("supports alphanumeric codes when context is strong", () => {
    const codes = extractVerificationCodes({
      subject: "One-time password",
      textBody: "Your OTP is AB12CD.",
    });

    expect(codes[0].code).toBe("AB12CD");
  });

  it("returns an empty list when no candidate exists", () => {
    const codes = extractVerificationCodes({
      subject: "Welcome",
      textBody: "Thanks for signing up.",
    });

    expect(codes).toEqual([]);
  });
});
