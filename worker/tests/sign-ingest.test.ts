import { describe, expect, it } from "vitest";
import { createIngestSignature } from "../src/sign-ingest";

describe("createIngestSignature", () => {
  it("creates a stable HMAC signature", async () => {
    const signature = await createIngestSignature({
      timestamp: "2026-05-05T12:00:00.000Z",
      body: "{\"ok\":true}",
      secret: "s".repeat(32),
    });

    expect(signature).toBe("cee069652fdedbb4598d7c920927c3912bd41f4c96fe0d8e00a15dcfc40c0ff6");
  });
});
