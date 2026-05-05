import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

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
    select: { id: true },
  });

  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { mailboxId: id },
    orderBy: { receivedAt: "desc" },
    take: 50,
    include: {
      verificationCodes: {
        orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  return NextResponse.json({ messages });
}
