"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MailboxDisableButton({ mailboxId }: { mailboxId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disable() {
    setError(null);
    setSubmitting(true);
    const response = await fetch(`/api/mailboxes/${mailboxId}`, { method: "PATCH" });
    setSubmitting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Mailbox disablement failed.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="stack">
      <button className="button danger" type="button" onClick={disable} disabled={submitting}>
        {submitting ? "Disabling" : "Disable"}
      </button>
      {error ? <p className="meta">{error}</p> : null}
    </div>
  );
}
