import { z } from "zod";
import { extractVerificationCodes } from "@/lib/verification/extract-codes";

export const ingestPayloadSchema = z.object({
  toAddress: z.string().email().transform((value) => value.toLowerCase()),
  fromAddress: z.string().min(1),
  subject: z.string().default(""),
  textBody: z.string().default(""),
  htmlBody: z.string().nullable().default(null),
  messageId: z.string().nullable().default(null),
  receivedAt: z.string().datetime(),
  rawSize: z.number().int().min(0),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

type MailboxLookupResult = {
  id: string;
  address: string;
  status: string;
  userId: string;
};

type IngestDb = {
  mailbox: {
    findUnique(args: unknown): Promise<MailboxLookupResult | null>;
  };
  message: {
    create(args: unknown): Promise<{ id: string }>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type IngestEmailResult =
  | { stored: true; messageId: string }
  | { stored: false; reason: "unknown_recipient" };

export async function ingestEmailMessage(input: {
  db: IngestDb;
  payload: IngestPayload;
}): Promise<IngestEmailResult> {
  const payload = ingestPayloadSchema.parse(input.payload);
  const mailbox = await input.db.mailbox.findUnique({
    where: { address: payload.toAddress },
  });

  if (!mailbox || mailbox.status !== "ACTIVE") {
    await input.db.auditLog.create({
      data: {
        userId: mailbox?.userId ?? null,
        eventType: "INGEST_UNKNOWN_RECIPIENT",
        message: "Received email for unknown or inactive mailbox.",
        metadata: { toAddress: payload.toAddress },
      },
    });
    return { stored: false, reason: "unknown_recipient" };
  }

  const candidates = extractVerificationCodes({
    subject: payload.subject,
    textBody: payload.textBody,
  });

  const message = await input.db.message.create({
    data: {
      mailboxId: mailbox.id,
      messageId: payload.messageId,
      fromAddress: payload.fromAddress,
      toAddress: payload.toAddress,
      subject: payload.subject,
      textBody: payload.textBody,
      htmlBody: payload.htmlBody,
      receivedAt: new Date(payload.receivedAt),
      rawSize: payload.rawSize,
      verificationCodes: {
        create: candidates.map((candidate) => ({
          code: candidate.code,
          confidence: candidate.confidence,
          context: candidate.context,
        })),
      },
    },
  });

  await input.db.auditLog.create({
    data: {
      userId: mailbox.userId,
      eventType: "INGEST_MESSAGE_STORED",
      message: "Stored inbound email message.",
      metadata: {
        mailboxId: mailbox.id,
        messageId: message.id,
        codeCount: candidates.length,
      },
    },
  });

  return { stored: true, messageId: message.id };
}
