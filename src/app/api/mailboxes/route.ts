import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CloudflareEmailRoutingClient } from "@/lib/cloudflare/email-routing-client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { createMailbox } from "@/lib/mailboxes/mailbox-service";

const createMailboxSchema = z.object({
  localPart: z.string().min(1).max(64),
});

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const mailboxes = await prisma.mailbox.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: { receivedAt: true },
      },
    },
  });

  return NextResponse.json({ mailboxes });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = createMailboxSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mailbox input." }, { status: 400 });
  }

  try {
    const mailbox = await createMailbox({
      userId: user.id,
      requestedLocalPart: parsed.data.localPart,
      domain: env.EMAIL_DOMAIN,
      maxActiveMailboxes: env.MAX_ACTIVE_MAILBOXES_PER_USER,
      workerName: env.EMAIL_WORKER_NAME,
      db: prisma,
      cloudflare: new CloudflareEmailRoutingClient({
        apiToken: env.CLOUDFLARE_API_TOKEN,
        zoneId: env.CLOUDFLARE_ZONE_ID,
      }),
    });

    return NextResponse.json({ mailbox }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mailbox creation failed." },
      { status: 400 },
    );
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
