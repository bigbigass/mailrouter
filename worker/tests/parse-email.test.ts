import { describe, expect, it } from "vitest";
import { parseEmailMessage } from "../src/parse-email";

describe("parseEmailMessage", () => {
  it("parses a simple raw email", async () => {
    const raw = new TextEncoder().encode(
      [
        "From: Sender <sender@example.net>",
        "To: user@example.com",
        "Subject: Your code",
        "Message-ID: <message-1@example.net>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Use code 123456 to continue.",
      ].join("\r\n"),
    );

    const parsed = await parseEmailMessage({
      raw,
      from: "sender@example.net",
      to: "USER@example.com",
      rawSize: raw.byteLength,
      receivedAt: new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(parsed).toMatchObject({
      toAddress: "user@example.com",
      fromAddress: "sender@example.net",
      subject: "Your code",
      textBody: "Use code 123456 to continue.",
      htmlBody: null,
      messageId: "<message-1@example.net>",
      receivedAt: "2026-05-05T12:00:00.000Z",
      rawSize: raw.byteLength,
    });
  });
});
