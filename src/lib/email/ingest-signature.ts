import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

type SignatureInput = {
  timestamp: string;
  body: string;
  secret: string;
};

export async function createIngestSignature(input: SignatureInput): Promise<string> {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
}

type VerifySignatureInput = SignatureInput & {
  signature: string;
  now?: Date;
};

export async function verifyIngestSignature(input: VerifySignatureInput): Promise<boolean> {
  const timestampMs = Date.parse(input.timestamp);

  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const nowMs = (input.now ?? new Date()).getTime();

  if (!Number.isFinite(nowMs) || Math.abs(nowMs - timestampMs) > MAX_SKEW_MS) {
    return false;
  }

  const expected = await createIngestSignature(input);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(input.signature, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
