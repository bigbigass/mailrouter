import { redirect } from "next/navigation";
import { MailboxCreateForm } from "@/components/mailbox-create-form";
import { MailboxList } from "@/components/mailbox-list";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export default async function MailboxesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
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

  return (
    <div className="stack">
      <div className="topbar">
        <div className="stack">
          <h1>Mailboxes</h1>
          <p className="muted">Signed in as {user.email}</p>
        </div>
      </div>
      <MailboxCreateForm domain={env.EMAIL_DOMAIN} />
      <MailboxList mailboxes={mailboxes} />
    </div>
  );
}
