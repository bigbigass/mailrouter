import { parseEmailMessage } from "./parse-email";
import { createIngestSignature } from "./sign-ingest";

export interface Env {
  APP_INGEST_URL: string;
  INGEST_SECRET: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const payload = await parseEmailMessage({
      raw: message.raw,
      from: message.from,
      to: message.to,
      rawSize: message.rawSize,
    });

    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();
    const signature = await createIngestSignature({
      timestamp,
      body,
      secret: env.INGEST_SECRET,
    });

    const request = fetch(env.APP_INGEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-timestamp": timestamp,
        "x-ingest-signature": signature,
      },
      body,
    });

    ctx.waitUntil(request);
  },
};
