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

type DisableMailboxRecord = {
  id: string;
  userId: string;
  address: string;
  cloudflareRuleId: string | null;
};

type MailboxDb = {
  mailbox: {
    count(args: unknown): Promise<number>;
    findUnique(args: unknown): Promise<unknown | null>;
    create(args: unknown): Promise<MailboxRecord>;
    update?(args: unknown): Promise<unknown>;
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

export async function disableMailbox(input: {
  userId: string;
  mailboxId: string;
  db: MailboxDb;
  cloudflare: CloudflareClient;
}): Promise<unknown> {
  if (!input.db.mailbox.update || !input.cloudflare.disableRule) {
    throw new Error("Disable dependencies are missing.");
  }

  const mailbox = (await input.db.mailbox.findUnique({
    where: { id: input.mailboxId },
  })) as DisableMailboxRecord | null;

  if (!mailbox || mailbox.userId !== input.userId) {
    throw new Error("Mailbox not found.");
  }

  await input.db.mailbox.update({
    where: { id: input.mailboxId },
    data: { status: "DISABLING" },
  });

  await input.db.auditLog.create({
    data: {
      userId: input.userId,
      eventType: "MAILBOX_DISABLE_STARTED",
      message: "Mailbox disablement started.",
      metadata: { mailboxId: input.mailboxId, address: mailbox.address },
    },
  });

  try {
    if (mailbox.cloudflareRuleId) {
      await input.cloudflare.disableRule(mailbox.cloudflareRuleId);
    }

    const disabled = await input.db.mailbox.update({
      where: { id: input.mailboxId },
      data: { status: "DISABLED", disabledAt: new Date() },
    });

    await input.db.auditLog.create({
      data: {
        userId: input.userId,
        eventType: "MAILBOX_DISABLED",
        message: "Mailbox disabled.",
        metadata: { mailboxId: input.mailboxId, address: mailbox.address },
      },
    });

    return disabled;
  } catch (error) {
    await input.db.auditLog.create({
      data: {
        userId: input.userId,
        eventType: "MAILBOX_DISABLE_FAILED",
        message: "Cloudflare rule disablement failed.",
        metadata: {
          mailboxId: input.mailboxId,
          address: mailbox.address,
          error: formatError(error),
        },
      },
    });
    throw new Error("Mailbox disablement failed.");
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
