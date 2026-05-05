import Link from "next/link";
import { CopyButton } from "@/components/copy-button";

type MailboxListItem = {
  id: string;
  address: string;
  status: string;
  createdAt: Date;
  _count: { messages: number };
  messages: Array<{ receivedAt: Date }>;
};

export function MailboxList({ mailboxes }: { mailboxes: MailboxListItem[] }) {
  if (mailboxes.length === 0) {
    return <p className="muted">No addresses yet.</p>;
  }

  return (
    <div className="panel">
      {mailboxes.map((mailbox) => (
        <div className="row" key={mailbox.id}>
          <div className="row-main">
            <Link className="row-title" href={`/mailboxes/${mailbox.id}`}>
              {mailbox.address}
            </Link>
            <div className="meta">
              <span className={mailbox.status === "ACTIVE" ? "badge active" : "badge warning"}>
                {mailbox.status}
              </span>{" "}
              {mailbox._count.messages} messages. Latest{" "}
              {mailbox.messages[0]?.receivedAt
                ? new Date(mailbox.messages[0].receivedAt).toLocaleString()
                : "none"}
            </div>
          </div>
          <CopyButton value={mailbox.address} />
        </div>
      ))}
    </div>
  );
}
