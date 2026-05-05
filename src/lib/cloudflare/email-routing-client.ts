type FetchFn = typeof fetch;

export type CloudflareClientOptions = {
  apiToken: string;
  zoneId: string;
  fetchFn?: FetchFn;
};

export type CreateWorkerRuleInput = {
  address: string;
  workerName: string;
};

type CloudflareError = {
  code?: number | string;
  message?: string;
};

type CloudflareEnvelope<T> = {
  success: boolean;
  errors?: CloudflareError[];
  messages?: unknown[];
  result: T;
};

type CloudflareRuleResult = {
  id: string;
  enabled?: boolean;
};

const API_BASE_URL = "https://api.cloudflare.com/client/v4";

export class CloudflareEmailRoutingClient {
  private readonly apiToken: string;
  private readonly zoneId: string;
  private readonly fetchFn: FetchFn;

  constructor(options: CloudflareClientOptions) {
    this.apiToken = options.apiToken;
    this.zoneId = options.zoneId;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async createWorkerRule(input: CreateWorkerRuleInput): Promise<{ id: string }> {
    const envelope = await this.request<CloudflareRuleResult>("POST", "/email/routing/rules", {
      enabled: true,
      name: `Route ${input.address} to ${input.workerName}`,
      matchers: [
        {
          type: "literal",
          field: "to",
          value: input.address,
        },
      ],
      actions: [
        {
          type: "worker",
          value: [input.workerName],
        },
      ],
    });

    if (!envelope.result || typeof envelope.result.id !== "string") {
      throw new Error("Cloudflare Email Routing API failed: missing rule id");
    }

    return { id: envelope.result.id };
  }

  async disableRule(ruleId: string): Promise<void> {
    await this.request<CloudflareRuleResult>(
      "DELETE",
      `/email/routing/rules/${encodeURIComponent(ruleId)}`,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<CloudflareEnvelope<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    };
    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await this.fetchFn(
      `${API_BASE_URL}/zones/${encodeURIComponent(this.zoneId)}${path}`,
      init,
    );
    const responseText = await response.text();
    const envelope = parseEnvelope<T>(responseText);

    if (!response.ok || !envelope?.success) {
      throw new Error(`Cloudflare Email Routing API failed: ${formatError(response, responseText, envelope)}`);
    }

    return envelope;
  }
}

function parseEnvelope<T>(responseText: string): CloudflareEnvelope<T> | null {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as CloudflareEnvelope<T>;
  } catch {
    return null;
  }
}

function formatError<T>(
  response: Response,
  responseText: string,
  envelope: CloudflareEnvelope<T> | null,
): string {
  const errorDetails = envelope?.errors
    ?.map((error) => [error.code, error.message].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("; ");

  if (errorDetails) {
    return errorDetails;
  }

  const fallback = responseText.trim() || response.statusText;

  if (fallback) {
    return `HTTP ${response.status} ${fallback}`;
  }

  return `HTTP ${response.status}`;
}
