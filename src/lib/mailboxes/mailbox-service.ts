import {
  buildMailboxAddress,
  normalizeDomain,
  validateLocalPart,
} from "@/lib/validation/mailbox";

type MailboxRecord = {
  id: string;
  address: string;
  cloudflareRuleId: string | null;
};

type MailboxDb = {
  mailbox: {
    count(args: unknown): Promise<number>;
    findUnique(args: unknown): Promise<unknown | null>;
    create(args: unknown): Promise<MailboxRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

type CloudflareClient = {
  createWorkerRule(input: { address: string; workerName: string }): Promise<{ id: string }>;
  disableRule?(ruleId: string): Promise<void>;
};

type CreateMailboxInput = {
  userId: string;
  requestedLocalPart: string;
  domain: string;
  maxActiveMailboxes: number;
  workerName: string;
  db: MailboxDb;
  cloudflare: CloudflareClient;
};

export async function createMailbox(input: CreateMailboxInput): Promise<MailboxRecord> {
  const validation = validateLocalPart(input.requestedLocalPart);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const activeCount = await input.db.mailbox.count({
    where: { userId: input.userId, status: "ACTIVE" },
  });

  if (activeCount >= input.maxActiveMailboxes) {
    throw new Error("Mailbox quota reached.");
  }

  const domain = normalizeDomain(input.domain);
  const address = buildMailboxAddress(validation.value, domain);
  const existing = await input.db.mailbox.findUnique({ where: { address } });

  if (existing) {
    throw new Error("Address is unavailable.");
  }

  let ruleId: string;

  try {
    const rule = await input.cloudflare.createWorkerRule({
      address,
      workerName: input.workerName,
    });
    ruleId = rule.id;
  } catch (error) {
    await auditMailboxCreateFailed(input, {
      address,
      error,
      message: "Cloudflare rule creation failed.",
    });
    throw new Error("Mailbox creation failed.");
  }

  try {
    const mailbox = await input.db.mailbox.create({
      data: {
        userId: input.userId,
        localPart: validation.value,
        domain,
        address,
        status: "ACTIVE",
        cloudflareRuleId: ruleId,
      },
    });

    await input.db.auditLog.create({
      data: {
        userId: input.userId,
        eventType: "MAILBOX_CREATED",
        message: "Mailbox created.",
        metadata: { address, ruleId },
      },
    });

    return mailbox;
  } catch (error) {
    let cleanupError: unknown;

    try {
      await input.cloudflare.disableRule?.(ruleId);
    } catch (caughtError) {
      cleanupError = caughtError;
    }

    await auditMailboxCreateFailed(input, {
      address,
      ruleId,
      error,
      cleanupError,
      message: "Database mailbox creation failed.",
    });
    throw new Error("Mailbox creation failed.");
  }
}

async function auditMailboxCreateFailed(
  input: CreateMailboxInput,
  failure: {
    address: string;
    message: string;
    ruleId?: string;
    error: unknown;
    cleanupError?: unknown;
  },
): Promise<void> {
  await input.db.auditLog.create({
    data: {
      userId: input.userId,
      eventType: "MAILBOX_CREATE_FAILED",
      message: failure.message,
      metadata: {
        address: failure.address,
        ruleId: failure.ruleId,
        error: formatError(failure.error),
        cleanupError: failure.cleanupError ? formatError(failure.cleanupError) : undefined,
      },
    },
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
