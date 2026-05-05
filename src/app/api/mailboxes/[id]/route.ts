import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CloudflareEmailRoutingClient } from "@/lib/cloudflare/email-routing-client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { disableMailbox } from "@/lib/mailboxes/mailbox-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const mailbox = await prisma.mailbox.findFirst({
    where: { id, userId: user.id },
  });

  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
  }

  return NextResponse.json({ mailbox });
}

export async function PATCH(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const mailbox = await disableMailbox({
      userId: user.id,
      mailboxId: id,
      db: prisma,
      cloudflare: new CloudflareEmailRoutingClient({
        apiToken: env.CLOUDFLARE_API_TOKEN,
        zoneId: env.CLOUDFLARE_ZONE_ID,
      }),
    });

    return NextResponse.json({ mailbox });
  } catch {
    return NextResponse.json({ error: "Mailbox disablement failed." }, { status: 400 });
  }
}
