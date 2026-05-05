import { describe, expect, it, vi } from "vitest";
import { CloudflareEmailRoutingClient } from "@/lib/cloudflare/email-routing-client";

describe("CloudflareEmailRoutingClient", () => {
  it("creates an email routing rule for a worker action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { id: "rule_123", enabled: true },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const client = new CloudflareEmailRoutingClient({
      apiToken: "token",
      zoneId: "zone",
      fetchFn: fetchMock,
    });

    const result = await client.createWorkerRule({
      address: "user@example.com",
      workerName: "email-worker",
    });

    expect(result).toEqual({ id: "rule_123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone/email/routing/rules",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "content-type": "application/json",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      enabled: true,
      name: "Route user@example.com to email-worker",
      matchers: [{ type: "literal", field: "to", value: "user@example.com" }],
      actions: [{ type: "worker", value: ["email-worker"] }],
    });
  });

  it("deletes a routing rule when disabling it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { id: "rule_123" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const client = new CloudflareEmailRoutingClient({
      apiToken: "token",
      zoneId: "zone",
      fetchFn: fetchMock,
    });

    await expect(client.disableRule("rule_123")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone/email/routing/rules/rule_123",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("throws a readable error when Cloudflare rejects the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 1000, message: "bad request" }],
          messages: [],
          result: null,
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    const client = new CloudflareEmailRoutingClient({
      apiToken: "token",
      zoneId: "zone",
      fetchFn: fetchMock,
    });

    await expect(
      client.createWorkerRule({ address: "user@example.com", workerName: "email-worker" }),
    ).rejects.toThrow("Cloudflare Email Routing API failed: 1000 bad request");
  });

  it("includes the HTTP status when Cloudflare returns a non-JSON error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 }));

    const client = new CloudflareEmailRoutingClient({
      apiToken: "token",
      zoneId: "zone",
      fetchFn: fetchMock,
    });

    await expect(
      client.createWorkerRule({ address: "user@example.com", workerName: "email-worker" }),
    ).rejects.toThrow("Cloudflare Email Routing API failed: HTTP 502 bad gateway");
  });
});
