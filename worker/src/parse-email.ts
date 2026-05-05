import PostalMime, { type RawEmail } from "postal-mime";

export type ParseEmailInput = {
  raw: RawEmail;
  from: string;
  to: string;
  rawSize: number;
  receivedAt?: Date;
};

export type IngestPayload = {
  toAddress: string;
  fromAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  messageId: string | null;
  receivedAt: string;
  rawSize: number;
};

export async function parseEmailMessage(input: ParseEmailInput): Promise<IngestPayload> {
  const parsed = await PostalMime.parse(input.raw);

  return {
    toAddress: input.to.toLowerCase(),
    fromAddress: input.from,
    subject: parsed.subject ?? "",
    textBody: parsed.text?.trimEnd() ?? "",
    htmlBody: parsed.html?.trimEnd() ?? null,
    messageId: parsed.messageId ?? null,
    receivedAt: (input.receivedAt ?? new Date()).toISOString(),
    rawSize: input.rawSize,
  };
}
