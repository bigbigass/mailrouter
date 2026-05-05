import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { MailboxDisableButton } from "@/components/mailbox-disable-button";
import { MessageList } from "@/components/message-list";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

type MailboxPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MailboxPage({ params }: MailboxPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const mailbox = await prisma.mailbox.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: {
        orderBy: { receivedAt: "desc" },
        take: 50,
        include: {
          verificationCodes: {
            orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (!mailbox) {
    notFound();
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div className="stack">
          <Link className="muted" href="/mailboxes">
            Back to mailboxes
          </Link>
          <h1>{mailbox.address}</h1>
          <p className="muted">
            <span className={mailbox.status === "ACTIVE" ? "badge active" : "badge warning"}>
              {mailbox.status}
            </span>
          </p>
        </div>
        <div className="topbar-actions">
          <CopyButton value={mailbox.address} />
          {mailbox.status === "ACTIVE" ? <MailboxDisableButton mailboxId={mailbox.id} /> : null}
        </div>
      </div>
      <MessageList messages={mailbox.messages} />
    </div>
  );
}
