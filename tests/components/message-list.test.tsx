/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { MessageList } from "@/components/message-list";

describe("MessageList", () => {
  it("shows the strongest extracted verification code", () => {
    render(
      React.createElement(MessageList, {
        messages: [
          {
            id: "message_1",
            fromAddress: "sender@example.net",
            subject: "Your code",
            textBody: "Use code 123456 to continue.",
            receivedAt: new Date("2026-05-05T12:00:00.000Z"),
            verificationCodes: [
              { id: "code_1", code: "123456", confidence: 95 },
              { id: "code_2", code: "654321", confidence: 80 },
            ],
          },
        ],
      }),
    );

    expect(screen.getByText("Your code")).toBeInTheDocument();
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.queryByText("654321")).not.toBeInTheDocument();
  });

  it("renders an empty state", () => {
    render(React.createElement(MessageList, { messages: [] }));

    expect(screen.getByText("No messages received yet.")).toBeInTheDocument();
  });
});
