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

  it("does not return context words from a subject-only verification email", () => {
    const codes = extractVerificationCodes({
      subject: "Your verification code",
      textBody: "",
    });

    expect(codes).toEqual([]);
  });

  it("does not return pure-letter context words", () => {
    const codes = extractVerificationCodes({
      subject: "",
      textBody: "Use security code 123456",
    });

    expect(codes.map((candidate) => candidate.code)).toEqual(["123456"]);
  });

  it("ignores unrelated receipt order and tracking numbers", () => {
    const codes = extractVerificationCodes({
      subject: "Receipt 123456",
      textBody: "Order 123456 is paid. Tracking number 837261 shipped.",
    });

    expect(codes).toEqual([]);
  });

  it("returns an empty list for whitespace-only input", () => {
    const codes = extractVerificationCodes({
      subject: "   ",
      textBody: "\n\t  ",
    });

    expect(codes).toEqual([]);
  });

  it("extracts a simplified Chinese check code", () => {
    const codes = extractVerificationCodes({
      subject: "校验码",
      textBody: "您的校验码是 541287。",
    });

    expect(codes[0]).toMatchObject({ code: "541287" });
  });

  it("extracts a traditional Chinese verification code", () => {
    const codes = extractVerificationCodes({
      subject: "驗證碼",
      textBody: "您的驗證碼是 382914。",
    });

    expect(codes[0]).toMatchObject({ code: "382914" });
  });

  it("normalizes separated numeric verification codes", () => {
    const codes = extractVerificationCodes({
      subject: "Your login code",
      textBody: "Your login code is 123-456",
    });

    expect(codes[0]).toMatchObject({ code: "123456" });
  });

  it("caps returned candidates", () => {
    const codes = extractVerificationCodes({
      subject: "Your verification codes",
      textBody:
        "Code 111111. Code 222222. Code 333333. Code 444444. Code 555555. Code 666666. Code 777777.",
    });

    expect(codes.length).toBeLessThanOrEqual(5);
  });

  it("extracts a year-like English login code with strong context", () => {
    const codes = extractVerificationCodes({
      subject: "",
      textBody: "Your login code is 2026",
    });

    expect(codes[0]).toMatchObject({ code: "2026" });
  });

  it("extracts a year-like Chinese verification code with strong context", () => {
    const codes = extractVerificationCodes({
      subject: "",
      textBody: "验证码是 1999",
    });

    expect(codes[0]).toMatchObject({ code: "1999" });
  });

  it("normalizes spaced numeric verification codes", () => {
    const codes = extractVerificationCodes({
      subject: "",
      textBody: "Your code is 123 456",
    });

    expect(codes[0]).toMatchObject({ code: "123456" });
  });

  it("does not use subject auth context for unrelated body numbers", () => {
    const codes = extractVerificationCodes({
      subject: "Your verification code",
      textBody: "Order 123456 is paid.",
    });

    expect(codes).toEqual([]);
  });
});
